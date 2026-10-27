/**
 * Keyset-курсор по паре (position, id) — как в сервисе синхронизации HR-tech,
 * где выборка шла по ("syncAt", id) вместо OFFSET. Курсор непрозрачен для клиента
 * (base64url), но легко проверяется на сервере.
 */

export interface KeysetCursor {
  position: number;
  id: number;
}

export function encodeCursor(c: KeysetCursor): string {
  return Buffer.from(`${c.position}:${c.id}`).toString('base64url');
}

export function decodeCursor(raw: string): KeysetCursor {
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const m = /^(\d+):(\d+)$/.exec(text);
  if (!m) throw new Error('Некорректный курсор');
  return { position: Number(m[1]), id: Number(m[2]) };
}
