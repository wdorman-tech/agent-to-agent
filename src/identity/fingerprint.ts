import { createHash } from 'node:crypto';
import { encodeBase32 } from '../lib/base32.js';

/**
 * Short, copy-pasteable identifier for a public key — used everywhere
 * the full 32-byte key would be unwieldy (CLI args, log lines, table
 * headings). Stable: same pubkey always produces the same fingerprint.
 *
 * 12 chars of base32(sha256(pubkey)). 5 bits/char * 12 = 60 bits of
 * collision resistance, which is fine for a local address book.
 */
export const FINGERPRINT_LEN = 12;

export function fingerprintOf(pubkey: Buffer): string {
  if (pubkey.length !== 32) {
    throw new TypeError(`pubkey must be 32 bytes, got ${pubkey.length}`);
  }
  const digest = createHash('sha256').update(pubkey).digest();
  return encodeBase32(digest).slice(0, FINGERPRINT_LEN);
}
