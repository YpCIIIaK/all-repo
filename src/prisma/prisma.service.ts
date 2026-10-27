import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Prisma-клиент как Nest-провайдер. Считает выполненные SQL-запросы — по этому счётчику
 * тесты проверяют, что вложенные поля GraphQL не порождают N+1.
 */
@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  queryCount = 0;

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    this.$on('query', (e) => {
      this.queryCount++;
      if (process.env.LOG_SQL === '1') this.logger.debug(`${e.duration}ms ${e.query}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
