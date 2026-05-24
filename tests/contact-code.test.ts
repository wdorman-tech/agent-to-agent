import { randomBytes } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { decodeBase32, encodeBase32 } from '../src/lib/base32.js';
import {
  CONTACT_CODE_PREFIX,
  decodeContactCode,
  encodeContactCode,
} from '../src/lib/contact-code.js';

describe('base32 (RFC 4648, lowercase, no padding)', () => {
  test('roundtrip for various lengths', () => {
    for (const n of [0, 1, 4, 5, 7, 32, 64, 100]) {
      const bytes = randomBytes(n);
      const text = encodeBase32(bytes);
      const back = Buffer.from(decodeBase32(text));
      expect(back.equals(bytes)).toBe(true);
    }
  });

  test('case-insensitive decode', () => {
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const lower = encodeBase32(bytes);
    const upper = lower.toUpperCase();
    expect(Buffer.from(decodeBase32(upper)).equals(bytes)).toBe(true);
  });

  test('rejects invalid character', () => {
    expect(() => decodeBase32('abc1')).toThrow(/invalid base32/);
  });
});

describe('contact code', () => {
  const pubkey = randomBytes(32);
  const url = 'https://agent.example.com/agent/inbox';

  test('roundtrip preserves pubkey + url', () => {
    const code = encodeContactCode({ pubkey, endpointUrl: url });
    expect(code.startsWith(CONTACT_CODE_PREFIX)).toBe(true);
    const back = decodeContactCode(code);
    expect(back.pubkey.equals(pubkey)).toBe(true);
    expect(back.endpointUrl).toBe(url);
  });

  test('decode tolerates surrounding whitespace and case', () => {
    const code = encodeContactCode({ pubkey, endpointUrl: url });
    const messy = `  ${code.toUpperCase()}  `;
    const back = decodeContactCode(messy);
    expect(back.pubkey.equals(pubkey)).toBe(true);
    expect(back.endpointUrl).toBe(url);
  });

  test('rejects missing prefix', () => {
    expect(() => decodeContactCode('not-a-code')).toThrow(/must start with/);
  });

  test('rejects wrong pubkey length', () => {
    expect(() => encodeContactCode({ pubkey: randomBytes(16), endpointUrl: url })).toThrow(
      /must be 32 bytes/,
    );
  });

  test('rejects empty url', () => {
    expect(() => encodeContactCode({ pubkey, endpointUrl: '' })).toThrow();
  });

  test('rejects bogus url after decode', () => {
    // Construct manually a code with a syntactically-invalid URL.
    const malformed = Buffer.concat([
      Buffer.from([0x01]),
      pubkey,
      Buffer.from([0x00, 0x05]), // url length 5
      Buffer.from('::::'), // not a URL — 4 bytes — length mismatch will trip first
    ]);
    const code = CONTACT_CODE_PREFIX + encodeBase32(malformed);
    expect(() => decodeContactCode(code)).toThrow();
  });
});
