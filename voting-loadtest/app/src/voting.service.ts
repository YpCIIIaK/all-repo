import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { config } from './config';
import { PrismaService, REDIS, SMS } from './infra.module';
import { hashCode, normalizePhone, readToken, sameHash, signToken } from './security';
import type { SmsJob } from './sms-queue';

const unavailable = () => new HttpException('Сервис временно недоступен, попробуйте ещё раз', HttpStatus.SERVICE_UNAVAILABLE);

export interface Results {
  total: number;
  candidates: { candidateId: number; votes: number }[];
  updatedAt: string;
}

@Injectable()
export class VotingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SMS) private readonly smsQueue: Queue<SmsJob>,
  ) {}

  /**
   * Запрос кода. СМС не отправляется здесь: задача уходит в очередь, ответ — сразу.
   * Один номер — не чаще раза в OTP_RESEND_SEC. Без Redis отказываем: иначе пропадёт защита
   * от рассылки СМС за наш счёт.
   */
  async requestCode(rawPhone: string): Promise<{ resendAfterSec: number }> {
    const phone = this.phone(rawPhone);
    const lockKey = `otp:resend:${phone}`;
    const locked = await this.redis.set(lockKey, '1', 'EX', config.otpResendSec, 'NX').catch(() => {
      throw unavailable();
    });
    if (locked === null) {
      throw new HttpException(`Код уже отправлен, повторить можно через ${config.otpResendSec} с`, HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      const [voter] = await this.prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO "Voter" ("phone") VALUES (${phone})
        ON CONFLICT ("phone") DO UPDATE SET "phone" = EXCLUDED."phone"
        RETURNING "id"`;
      await this.smsQueue.add(
        'otp',
        { voterId: voter.id, phone },
        { attempts: config.sms.attempts, backoff: { type: 'custom' }, removeOnComplete: true, removeOnFail: false },
      );
    } catch {
      // Код не ушёл — снимаем блокировку, чтобы человек мог сразу повторить.
      await this.redis.del(lockKey).catch(() => undefined);
      throw unavailable();
    }
    return { resendAfterSec: config.otpResendSec };
  }

  /**
   * Проверка кода. Попытка сначала резервируется атомарным INCR и только потом сверяется:
   * так параллельные запросы не обходят лимит в OTP_MAX_ATTEMPTS неверных кодов.
   */
  async verifyCode(rawPhone: string, code: string): Promise<{ token: string }> {
    const phone = this.phone(rawPhone);
    const failKey = `otp:attempts:${phone}`;
    const attempt = await this.redis
      .multi()
      .incr(failKey)
      .expire(failKey, config.otpLockSec, 'NX')
      .exec()
      .then((r) => Number(r?.[0]?.[1]))
      .catch(() => {
        throw unavailable();
      });
    if (!Number.isFinite(attempt)) throw unavailable();
    if (attempt > config.otpMaxAttempts) {
      throw new HttpException('Слишком много неверных попыток, попробуйте позже', HttpStatus.TOO_MANY_REQUESTS);
    }

    const wrong = new HttpException('Неверный или просроченный код', HttpStatus.BAD_REQUEST);
    if (!/^\d{6}$/.test(code)) throw wrong;
    const voter = await this.prisma.voter.findUnique({ where: { phone }, select: { id: true } });
    if (!voter) throw wrong;
    // Несколько последних кодов: после «отправить ещё раз» может первым прийти старый.
    // Срок — от отправки, а если воркер ещё не успел её отметить (СМС дошла быстрее, чем записалась
    // отметка), — от создания кода. Требовать sentAt нельзя: под нагрузкой это отклоняет верные коды.
    const cutoff = Date.now() - config.otpTtlSec * 1000;
    const codes = await this.prisma.otpCode.findMany({
      where: { voterId: voter.id, usedAt: null, createdAt: { gte: new Date(cutoff - config.otpTtlSec * 1000) } },
      orderBy: { id: 'desc' },
      take: 3,
      select: { id: true, codeHash: true, sentAt: true, createdAt: true },
    });
    const hash = hashCode(voter.id, code);
    const match = codes.find((c) => (c.sentAt ?? c.createdAt).getTime() >= cutoff && sameHash(c.codeHash, hash));
    if (!match) throw wrong;

    const used = await this.prisma.otpCode.updateMany({ where: { id: match.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw wrong;
    await this.prisma.voter.updateMany({ where: { id: voter.id, verifiedAt: null }, data: { verifiedAt: new Date() } });
    await this.redis.del(failKey).catch(() => undefined);
    return { token: signToken(voter.id) };
  }

  /**
   * Голос. Второй голос того же человека не проходит на уровне базы (уникальный индекс),
   * а повтор после обрыва связи безопасен: ответ «уже проголосовал» вместо ошибки.
   */
  async castVote(authorization: string | undefined, candidateId: number): Promise<{ alreadyVoted: boolean }> {
    const voterId = readToken((authorization ?? '').replace(/^Bearer\s+/i, ''));
    if (voterId === null) throw new HttpException('Нужно подтвердить номер телефона', HttpStatus.UNAUTHORIZED);
    if (!Number.isInteger(candidateId) || candidateId < 1 || candidateId > config.candidates) {
      throw new HttpException('Нет такого варианта', HttpStatus.BAD_REQUEST);
    }
    const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO "Vote" ("pollId", "voterId", "candidateId") VALUES (${config.pollId}, ${voterId}, ${candidateId})
      ON CONFLICT ("pollId", "voterId") DO NOTHING
      RETURNING "id"`;
    return { alreadyVoted: inserted.length === 0 };
  }

  /** Результаты: GROUP BY в базе, кэш на несколько секунд, чтобы обновления страницы не грузили базу. */
  async results(): Promise<Results> {
    const key = `results:${config.pollId}`;
    const cached = await this.redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as Results;
    const rows = await this.prisma.vote.groupBy({
      by: ['candidateId'],
      where: { pollId: config.pollId },
      _count: { _all: true },
      orderBy: { candidateId: 'asc' },
    });
    const value: Results = {
      total: rows.reduce((sum, r) => sum + r._count._all, 0),
      candidates: rows.map((r) => ({ candidateId: r.candidateId, votes: r._count._all })),
      updatedAt: new Date().toISOString(),
    };
    await this.redis.set(key, JSON.stringify(value), 'EX', config.resultsCacheSec).catch(() => undefined);
    return value;
  }

  private phone(raw: string): string {
    const phone = normalizePhone(raw);
    if (!phone) throw new HttpException('Неверный номер телефона', HttpStatus.BAD_REQUEST);
    return phone;
  }
}
