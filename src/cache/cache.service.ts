import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Кэш и счётчики в Redis. Redis необязателен: без REDIS_URL сервис работает как no-op,
 * и API просто ходит в базу. Ошибки Redis не роняют запросы — только пишутся в лог.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    this.redis = url ? new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false }) : null;
    this.redis?.on('error', (e) => this.logger.warn(`Redis: ${e.message}`));
  }

  get enabled(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  /** Cache-aside: вернуть из кэша или посчитать, сохранить на ttl секунд и вернуть. */
  async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    if (!this.enabled) return load();
    const fullKey = `${await this.version()}:${key}`;
    try {
      const hit = await this.redis!.get(fullKey);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (e) {
      this.logger.warn(`cache read ${key}: ${(e as Error).message}`);
    }
    const value = await load();
    this.redis!.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds).catch(() => undefined);
    return value;
  }

  /**
   * Версия данных — хэш последнего сида. Сменилась версия — старые ключи просто перестают
   * читаться и истекают сами, без SCAN/DEL по всему кэшу.
   */
  async bumpVersion(version: string): Promise<void> {
    if (!this.enabled) return;
    await this.redis!.set('cv:data-version', version).catch(() => undefined);
  }

  private async version(): Promise<string> {
    return (await this.redis!.get('cv:data-version').catch(() => null)) ?? 'v0';
  }

  /** Счётчик в окне фиксированной длины. Возвращает число обращений в текущем окне. */
  async hit(key: string, windowSeconds: number): Promise<number | null> {
    if (!this.enabled) return null;
    try {
      const count = await this.redis!.incr(key);
      if (count === 1) await this.redis!.expire(key, windowSeconds);
      return count;
    } catch {
      return null;
    }
  }

  async ping(): Promise<'up' | 'down' | 'disabled'> {
    if (!this.redis) return 'disabled';
    try {
      return (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }
}
