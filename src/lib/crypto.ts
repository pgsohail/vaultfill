/**
 * Zero-knowledge vault crypto built only on Web Crypto.
 * - KDF: PBKDF2-HMAC-SHA256, 600,000 iterations (OWASP 2023 guidance), 16-byte random salt.
 * - Cipher: AES-256-GCM, fresh random 12-byte IV per encryption, record id bound as AAD
 *   so ciphertexts cannot be swapped between entries.
 */
export const PBKDF2_ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface EncryptedBlob {
  iv: string;
  ct: string;
}

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Derives 256 raw key bits from the master password. Caller should zero the result when done. */
export async function deriveRawKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

export function importAesKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(key: CryptoKey, value: unknown, aad: string): Promise<EncryptedBlob> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function decryptJSON<T>(key: CryptoKey, blob: EncryptedBlob, aad: string): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(blob.iv), additionalData: enc.encode(aad) },
    key,
    fromB64(blob.ct),
  );
  return JSON.parse(dec.decode(pt)) as T;
}
