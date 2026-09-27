import { describe, expect, it } from 'vitest';
import { decryptJSON, deriveRawKey, encryptJSON, importAesKey, randomBytes } from '@/lib/crypto';

describe('crypto', () => {
  it('round-trips with AES-GCM and a unique IV per encryption', async () => {
    const key = await importAesKey(await deriveRawKey('correct horse', randomBytes(16), 1000));
    const a = await encryptJSON(key, { secret: 'x' }, 'aad');
    const b = await encryptJSON(key, { secret: 'x' }, 'aad');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(await decryptJSON(key, a, 'aad')).toEqual({ secret: 'x' });
  });

  it('rejects a ciphertext moved to another record (AAD binding)', async () => {
    const key = await importAesKey(await deriveRawKey('pw', randomBytes(16), 1000));
    const blob = await encryptJSON(key, 'data', 'entry:1');
    await expect(decryptJSON(key, blob, 'entry:2')).rejects.toThrow();
  });

  it('rejects the wrong key', async () => {
    const salt = randomBytes(16);
    const k1 = await importAesKey(await deriveRawKey('one', salt, 1000));
    const k2 = await importAesKey(await deriveRawKey('two', salt, 1000));
    await expect(decryptJSON(k2, await encryptJSON(k1, 'data', 'a'), 'a')).rejects.toThrow();
  });

  it('derives deterministic 256-bit keys from password + salt', async () => {
    const salt = randomBytes(16);
    const a = await deriveRawKey('pw', salt, 1000);
    expect(a.length).toBe(32);
    expect([...a]).toEqual([...(await deriveRawKey('pw', salt, 1000))]);
  });
});
