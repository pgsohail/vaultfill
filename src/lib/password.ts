import { DEFAULT_GENERATOR, type GeneratorOptions } from './types';

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
};
const AMBIGUOUS = /[Il1O0o|`'"]/g;

/** Uniform integer in [0, max) using rejection sampling (no modulo bias). */
export function randomInt(max: number): number {
  if (max <= 0 || max > 2 ** 32) throw new RangeError('max out of range');
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generatePassword(opts: GeneratorOptions = DEFAULT_GENERATOR): string {
  const length = Math.min(128, Math.max(8, Math.floor(opts.length)));
  const pools = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => opts[k])
    .map((k) => (opts.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
  if (pools.length === 0) pools.push(SETS.lower);

  // One char from every enabled pool guarantees site complexity rules pass.
  const chars = pools.map((p) => p[randomInt(p.length)]);
  const all = pools.join('');
  while (chars.length < length) chars.push(all[randomInt(all.length)]);

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function generatorEntropyBits(opts: GeneratorOptions): number {
  const pool = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => opts[k])
    .reduce((n, k) => n + (opts.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]).length, 0);
  return Math.round(opts.length * Math.log2(Math.max(pool, 1)));
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; bits: number };

/** Rough strength estimate for user-chosen passwords (penalises repeats, sequences, common words). */
export function estimateStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: 'Empty', bits: 0 };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  const unique = new Set(pw).size;
  let bits = Math.log2(Math.max(pool, 1)) * Math.min(pw.length, unique * 2);
  if (/(.)\1{2,}/.test(pw)) bits -= 10;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv)/i.test(pw)) bits -= 15;
  if (/(password|letmein|welcome|admin|iloveyou|monkey|dragon|qwerty)/i.test(pw)) bits -= 25;
  bits = Math.max(0, Math.round(bits));
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  const label = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score];
  return { score: score as Strength['score'], label, bits };
}
