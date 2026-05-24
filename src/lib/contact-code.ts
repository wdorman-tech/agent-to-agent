/**
 * Contact code: a single user-shareable string carrying everything needed
 * to send a signed message to an agent — its public key and its inbox URL.
 *
 * Format (v1, lowercase base32, no padding):
 *
 *     a2a1.<base32 body>
 *
 * Body layout:
 *     1 byte:  version (must be 0x01)
 *    32 bytes: Ed25519 public key
 *     2 bytes: URL length (big-endian)
 *     N bytes: inbox URL as UTF-8
 *
 * Result is ~140–180 characters for a typical HTTPS inbox URL. No
 * dependency beyond Node stdlib and our own base32.
 */
import { decodeBase32, encodeBase32 } from './base32.js';

export const CONTACT_CODE_PREFIX = 'a2a1.';
const VERSION = 0x01;
const PUBKEY_LEN = 32;
const MAX_URL_LEN = 2048;

export interface ContactCodePayload {
  pubkey: Buffer; // 32 bytes
  endpointUrl: string;
}

export function encodeContactCode({ pubkey, endpointUrl }: ContactCodePayload): string {
  if (pubkey.length !== PUBKEY_LEN) {
    throw new TypeError(`pubkey must be ${PUBKEY_LEN} bytes, got ${pubkey.length}`);
  }
  if (endpointUrl.length === 0 || endpointUrl.length > MAX_URL_LEN) {
    throw new TypeError(`endpointUrl length must be 1..${MAX_URL_LEN}`);
  }
  // Validate URL parses.
  // (We allow http for localhost dev; HTTPS check happens at delivery time.)
  try {
    // eslint-disable-next-line no-new
    new URL(endpointUrl);
  } catch {
    throw new TypeError(`endpointUrl is not a valid URL: ${endpointUrl}`);
  }

  const urlBytes = Buffer.from(endpointUrl, 'utf8');
  const buf = Buffer.alloc(1 + PUBKEY_LEN + 2 + urlBytes.length);
  let o = 0;
  buf[o++] = VERSION;
  pubkey.copy(buf, o);
  o += PUBKEY_LEN;
  buf.writeUInt16BE(urlBytes.length, o);
  o += 2;
  urlBytes.copy(buf, o);

  return CONTACT_CODE_PREFIX + encodeBase32(buf);
}

export function decodeContactCode(code: string): ContactCodePayload {
  const trimmed = code.trim();
  if (!trimmed.toLowerCase().startsWith(CONTACT_CODE_PREFIX)) {
    throw new TypeError(`contact code must start with '${CONTACT_CODE_PREFIX}'`);
  }
  const body = trimmed.slice(CONTACT_CODE_PREFIX.length);
  let raw: Uint8Array;
  try {
    raw = decodeBase32(body);
  } catch (cause) {
    throw new TypeError(
      `contact code body is not valid base32: ${cause instanceof Error ? cause.message : cause}`,
    );
  }
  if (raw.length < 1 + PUBKEY_LEN + 2) {
    throw new TypeError('contact code body is too short');
  }
  if (raw[0] !== VERSION) {
    throw new TypeError(`unknown contact code version: 0x${raw[0]?.toString(16) ?? '??'}`);
  }
  const pubkey = Buffer.from(raw.subarray(1, 1 + PUBKEY_LEN));
  const urlLen = (raw[1 + PUBKEY_LEN]! << 8) | raw[1 + PUBKEY_LEN + 1]!;
  if (urlLen === 0 || urlLen > MAX_URL_LEN) {
    throw new TypeError(`contact code URL length out of bounds: ${urlLen}`);
  }
  if (raw.length !== 1 + PUBKEY_LEN + 2 + urlLen) {
    throw new TypeError('contact code length does not match declared URL length');
  }
  const endpointUrl = Buffer.from(
    raw.subarray(1 + PUBKEY_LEN + 2, 1 + PUBKEY_LEN + 2 + urlLen),
  ).toString('utf8');
  try {
    // eslint-disable-next-line no-new
    new URL(endpointUrl);
  } catch {
    throw new TypeError(`decoded URL is not a valid URL: ${endpointUrl}`);
  }
  return { pubkey, endpointUrl };
}
