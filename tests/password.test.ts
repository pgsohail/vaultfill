import { describe, expect, it } from 'vitest';
import { estimateStrength, generatePassword, randomInt } from '@/lib/password';
import { DEFAULT_GENERATOR } from '@/lib/types';

describe('password generator', () => {
  it('honours length and includes every enabled class', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ ...DEFAULT_GENERATOR, length: 12 });
      expect(pw).toHaveLength(12);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/\d/);
      expect(pw).toMatch(/[^a-zA-Z0-9]/);
      expect(pw).not.toMatch(/[Il1O0o]/);
    }
  });

  it('is unbiased enough (every digit appears)', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 5000; i++) counts[randomInt(10)]++;
    for (const c of counts) expect(c).toBeGreaterThan(350);
  });

  it('scores obvious passwords as weak', () => {
    expect(estimateStrength('password123').score).toBeLessThanOrEqual(1);
    expect(estimateStrength('correct-Horse-battery-staple-92').score).toBeGreaterThanOrEqual(3);
  });
});
