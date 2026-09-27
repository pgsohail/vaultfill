import { describe, expect, it } from 'vitest';
import { totp } from '@/lib/totp';

// RFC 6238 Appendix B test vectors (SHA-1, secret "12345678901234567890").
const URI = 'otpauth://totp/test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8&period=30';

describe('TOTP', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('t=%i → %s', async (t, code) => {
    expect((await totp(URI, t * 1000)).code).toBe(code);
  });

  it('accepts a bare base32 secret (6 digits, 30s)', async () => {
    const r = await totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000);
    expect(r.code).toBe('287082');
    expect(r.remaining).toBe(1);
  });
});
