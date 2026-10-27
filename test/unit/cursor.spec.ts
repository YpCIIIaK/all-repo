import { decodeCursor, encodeCursor } from '../../src/common/cursor';

describe('keyset-курсор', () => {
  it('кодирует и декодирует пару (position, id)', () => {
    const c = { position: 7, id: 42 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('отклоняет подделанный курсор', () => {
    expect(() => decodeCursor('zzz')).toThrow();
    expect(() => decodeCursor(Buffer.from('1:x').toString('base64url'))).toThrow();
    expect(() => decodeCursor(Buffer.from("1:2; DROP TABLE").toString('base64url'))).toThrow();
  });
});
