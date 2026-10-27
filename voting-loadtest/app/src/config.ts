/**
 * Настройки из переменных окружения.
 *
 * Все длительности задаются в «реальном» времени голосования. В ускоренном тесте (TIME_SCALE > 1)
 * внешний мир ускоряется: сроки жизни кодов, паузы между повторами и лимит СМС-провайдера
 * пересчитываются здесь, а сам сервер не ускоряется — он получает в TIME_SCALE раз больше запросов в секунду.
 */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name}: ожидается число, получено "${raw}"`);
  return value;
}

export const TIME_SCALE = num('TIME_SCALE', 1);

/** Длительность реального мира (секунды) → длительность в тесте, не меньше минимума. */
export function scaledSec(realSec: number, minSec = 1): number {
  return Math.max(minSec, Math.round(realSec / TIME_SCALE));
}

export const config = {
  port: num('PORT', 3000),
  pollId: 1,
  candidates: num('CANDIDATES', 5),

  otpTtlSec: scaledSec(num('OTP_TTL_SEC', 300)),
  otpResendSec: scaledSec(num('OTP_RESEND_SEC', 60)),
  otpMaxAttempts: num('OTP_MAX_ATTEMPTS', 5),
  otpLockSec: scaledSec(num('OTP_LOCK_SEC', 900)),

  tokenSecret: process.env.TOKEN_SECRET || 'dev-only-secret-change-me',
  tokenTtlSec: scaledSec(num('TOKEN_TTL_SEC', 3600)),

  /** Кэш результатов — параметр производительности сервера, поэтому не масштабируется. */
  resultsCacheSec: num('RESULTS_CACHE_SEC', 2),

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  sms: {
    providerUrl: process.env.SMS_PROVIDER_URL || 'http://localhost:8080',
    /** Лимит провайдера по договору (СМС в секунду) — столько же отправляет воркер. */
    ratePerSec: Math.max(1, Math.round(num('SMS_RATE', 20) * TIME_SCALE)),
    concurrency: num('SMS_CONCURRENCY', 50),
    attempts: num('SMS_ATTEMPTS', 20),
    backoffBaseMs: Math.max(50, Math.round(1000 / TIME_SCALE)),
    backoffMaxMs: Math.max(200, Math.round(30_000 / TIME_SCALE)),
    /** Через сколько задача упавшего воркера вернётся в очередь. */
    lockMs: Math.max(5_000, Math.round(30_000 / TIME_SCALE)),
  },
};
