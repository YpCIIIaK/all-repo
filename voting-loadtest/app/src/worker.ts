/**
 * Воркер СМС — отдельный процесс из того же образа.
 * Берёт задачи из очереди BullMQ (Redis), отправляет не чаще лимита провайдера, при ошибке повторяет.
 * Упадёт или перезапустится — задачи останутся в Redis и будут доотправлены.
 */
import { PrismaClient } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import { TIME_SCALE, config } from './config';
import { generateCode, hashCode } from './security';
import { SMS_QUEUE, SmsJob, redisConnection, smsBackoff } from './sms-queue';

const prisma = new PrismaClient();
let sent = 0;
let failed = 0;

async function send(job: Job<SmsJob>): Promise<void> {
  let { otpId, code } = job.data;
  if (!otpId || !code) {
    code = generateCode();
    const row = await prisma.otpCode.create({
      data: { voterId: job.data.voterId, codeHash: hashCode(job.data.voterId, code) },
      select: { id: true },
    });
    otpId = row.id;
    await job.updateData({ ...job.data, otpId, code });
  }

  const res = await fetch(`${config.sms.providerUrl}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: job.data.phone, text: `Код для голосования: ${code}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`СМС-провайдер ответил ${res.status}`);
  await prisma.otpCode.update({ where: { id: otpId }, data: { sentAt: new Date() } });
}

const worker = new Worker<SmsJob>(SMS_QUEUE, send, {
  connection: redisConnection({ maxRetriesPerRequest: null }),
  concurrency: config.sms.concurrency,
  limiter: { max: config.sms.ratePerSec, duration: 1000 },
  lockDuration: config.sms.lockMs,
  stalledInterval: config.sms.lockMs,
  settings: { backoffStrategy: (attemptsMade: number) => smsBackoff(attemptsMade) },
});

worker.on('completed', () => sent++);
worker.on('failed', (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    failed++;
    console.error(`СМС на ${job.data.phone} не отправлена после ${job.attemptsMade} попыток: ${err.message}`);
  }
});

console.log(
  `Воркер СМС: до ${config.sms.ratePerSec} СМС/с, параллельно ${config.sms.concurrency}, ускорение ×${TIME_SCALE}`,
);
const report = setInterval(() => console.log(`Отправлено ${sent}, окончательно не отправлено ${failed}`), 10_000);

async function shutdown() {
  clearInterval(report);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
