import { randomBytes } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { seal, unseal } from '../src/identity/seal.js';

describe('seal/unseal', () => {
  test('roundtrip preserves bytes', () => {
    const key = randomBytes(32);
    const plain = Buffer.from('hello world');
    const sealed = seal(plain, key);
    expect(unseal(sealed, key).toString('utf8')).toBe('hello world');
  });

  test('different invocations produce different ciphertexts (random IV)', () => {
    const key = randomBytes(32);
    const plain = Buffer.from('same input');
    const a = seal(plain, key);
    const b = seal(plain, key);
    expect(a.equals(b)).toBe(false);
  });

  test('wrong key throws (auth tag fails)', () => {
    const key1 = randomBytes(32);
    const key2 = randomBytes(32);
    const sealed = seal(Buffer.from('secret'), key1);
    expect(() => unseal(sealed, key2)).toThrow();
  });

  test('tampered ciphertext throws', () => {
    const key = randomBytes(32);
    const sealed = seal(Buffer.from('secret'), key);
    sealed[15] ^= 0xff;
    expect(() => unseal(sealed, key)).toThrow();
  });

  test('requires 32-byte key', () => {
    expect(() => seal(Buffer.from('x'), randomBytes(16))).toThrow();
  });
});
