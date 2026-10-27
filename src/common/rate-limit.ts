import type { NextFunction, Request, Response } from 'express';
import type { CacheService } from '../cache/cache.service';

/**
 * Ограничение частоты запросов к /graphql: фиксированное окно в Redis (INCR + EXPIRE).
 * Без Redis лимит не применяется — API остаётся доступным.
 */
export function rateLimit(cache: CacheService, limitPerMinute: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();
    const window = Math.floor(Date.now() / 60_000);
    const count = await cache.hit(`rl:${req.ip}:${window}`, 60);
    if (count !== null) {
      res.setHeader('X-RateLimit-Limit', limitPerMinute);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limitPerMinute - count));
      if (count > limitPerMinute) {
        res.status(429).json({ errors: [{ message: 'Слишком много запросов, попробуйте через минуту' }] });
        return;
      }
    }
    next();
  };
}
