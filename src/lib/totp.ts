/** RFC 6238 TOTP (and RFC 4226 HOTP) on Web Crypto. */
export interface TotpParams {
  secret: Uint8Array<ArrayBuffer>;
  digits: number;
  period: number;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
}

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function parseTotp(raw: string): TotpParams {
  const s = raw.trim();
  if (s.toLowerCase().startsWith('otpauth://')) {
    const u = new URL(s);
    const alg = (u.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace('SHA', 'SHA-');
    return {
      secret: base32Decode(u.searchParams.get('secret') ?? ''),
      digits: Number(u.searchParams.get('digits') ?? 6),
      period: Number(u.searchParams.get('period') ?? 30),
      algorithm: (['SHA-1', 'SHA-256', 'SHA-512'].includes(alg) ? alg : 'SHA-1') as TotpParams['algorithm'],
    };
  }
  return { secret: base32Decode(s), digits: 6, period: 30, algorithm: 'SHA-1' };
}

export async function hotp(p: TotpParams, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', p.secret, { name: 'HMAC', hash: p.algorithm }, false, [
    'sign',
  ]);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** p.digits).padStart(p.digits, '0');
}

export async function totp(raw: string, now = Date.now()): Promise<{ code: string; remaining: number }> {
  const p = parseTotp(raw);
  const step = Math.floor(now / 1000 / p.period);
  const remaining = p.period - (Math.floor(now / 1000) % p.period);
  return { code: await hotp(p, step), remaining };
}
