import { Controller, Get, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

/** Проверка живости для платформы деплоя: база обязательна, Redis — нет. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  @HttpCode(200)
  async check() {
    const db = await this.prisma.$queryRaw`SELECT 1`.then(() => 'up' as const).catch(() => 'down' as const);
    const redis = await this.cache.ping();
    const body = { status: db === 'up' ? 'ok' : 'error', db, redis };
    if (db !== 'up') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
