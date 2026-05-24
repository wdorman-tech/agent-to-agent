/**
 * RFC 4648 base32 (lowercase, no padding). Case-insensitive on decode.
 * No external dep — small enough to inline.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export function encodeBase32(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let out = '';
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buf = (buf << 8) | (bytes[i] as number);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buf >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += ALPHABET[(buf << (5 - bits)) & 0x1f];
  return out;
}

const LOOKUP = new Int8Array(256).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) {
  LOOKUP[ALPHABET.charCodeAt(i)] = i;
  LOOKUP[ALPHABET.toUpperCase().charCodeAt(i)] = i;
}

export function decodeBase32(text: string): Uint8Array {
  // Strip any padding or whitespace.
  const clean = text.replace(/=/g, '').replace(/\s+/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let buf = 0;
  let bits = 0;
  let outIdx = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = LOOKUP[clean.charCodeAt(i)];
    if (v === undefined || v < 0) {
      throw new TypeError(`invalid base32 character at position ${i}: ${JSON.stringify(clean[i])}`);
    }
    buf = (buf << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, outIdx);
}
