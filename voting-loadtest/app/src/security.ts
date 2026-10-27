import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from './config';

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** В базе хранится только HMAC кода: утечка таблицы не раскрывает действующие коды. */
export function hashCode(voterId: number, code: string): string {
  return createHmac('sha256', config.tokenSecret).update(`otp:${voterId}:${code}`).digest('base64url');
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Токен сессии после подтверждения номера: `voterId.expiresAt.signature`. */
export function signToken(voterId: number): string {
  const exp = Math.floor(Date.now() / 1000) + config.tokenTtlSec;
  const payload = `${voterId}.${exp}`;
  return `${payload}.${createHmac('sha256', config.tokenSecret).update(payload).digest('base64url')}`;
}

/** Возвращает voterId или null, если токен подделан или истёк. */
export function readToken(token: string): number | null {
  const [id, exp, sig] = token.split('.');
  if (!id || !exp || !sig) return null;
  const expected = createHmac('sha256', config.tokenSecret).update(`${id}.${exp}`).digest('base64url');
  if (!sameHash(sig, expected)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const voterId = Number(id);
  return Number.isInteger(voterId) && voterId > 0 ? voterId : null;
}

/** Номер в формате E.164: +79001234567. */
export function normalizePhone(raw: string): string | null {
  const phone = raw.replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{9,14}$/.test(phone) ? phone : null;
}
