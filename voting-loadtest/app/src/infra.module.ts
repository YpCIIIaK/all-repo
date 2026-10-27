import { Global, Inject, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config';
import { SMS_QUEUE, SmsJob, redisConnection } from './sms-queue';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

export const REDIS = Symbol('REDIS');
export const SMS = Symbol('SMS_QUEUE');

/** Закрывает соединения с Redis при остановке приложения. */
@Injectable()
class RedisShutdown implements OnModuleDestroy {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SMS) private readonly queue: Queue<SmsJob>,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close().catch(() => undefined);
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    PrismaService,
    // Лимиты и кэш: при недоступном Redis запрос падает быстро, а не висит.
    { provide: REDIS, useFactory: () => new Redis(config.redisUrl, { maxRetriesPerRequest: 1 }) },
    // Продюсер очереди: enableOfflineQueue=false — без Redis add() сразу бросает ошибку.
    {
      provide: SMS,
      useFactory: () =>
        new Queue<SmsJob>(SMS_QUEUE, { connection: redisConnection({ enableOfflineQueue: false }) }),
    },
    RedisShutdown,
  ],
  exports: [PrismaService, REDIS, SMS],
})
export class InfraModule {}
