import type { ConnectionOptions } from 'bullmq';
import { config } from './config';

export const SMS_QUEUE = 'sms';

/** Задача «отправить код». otpId и code появляются после первой попытки, повторы шлют тот же код. */
export interface SmsJob {
  voterId: number;
  phone: string;
  otpId?: number;
  code?: string;
}

export function redisConnection(extra: Partial<ConnectionOptions> = {}): ConnectionOptions {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    ...extra,
  } as ConnectionOptions;
}

/** Повторы при ошибке провайдера: 1 с, 2 с, 4 с … но не реже раза в 30 с (в реальном времени). */
export function smsBackoff(attemptsMade: number): number {
  return Math.min(config.sms.backoffMaxMs, config.sms.backoffBaseMs * 2 ** Math.max(0, attemptsMade - 1));
}
