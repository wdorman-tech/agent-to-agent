import { ulid } from 'ulid';
import { z } from 'zod';
import { signBytes, verifyBytes } from '../identity/sign.js';
import { decodeBase32, encodeBase32 } from '../lib/base32.js';
import { BadEnvelope, BadSignature } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';
import { canonicalBytes, type Json } from './canonical.js';

export const PROTOCOL_VERSION = '0.1';

/** Base32-encoded 32-byte Ed25519 public key (52 chars, no padding). */
const PubkeyB32 = z.string().regex(/^[a-z2-7]{52}$/, {
  message: 'pubkey must be 52 lowercase base32 chars (32 bytes)',
});

export const EnvelopeSchema = z.object({
  id: z.string().min(10).max(64),
  version: z.string(),
  from: PubkeyB32,
  to: PubkeyB32,
  timestamp: z.string(),
  in_reply_to: z.string().nullable(),
  body: z
    .string()
    .min(1)
    .max(64 * 1024),
  signature: z.object({
    algorithm: z.literal('ed25519'),
    value: z.string(), // base64
  }),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;

export interface UnsignedEnvelope {
  id: string;
  version: string;
  from: string;
  to: string;
  timestamp: string;
  in_reply_to: string | null;
  body: string;
}

export interface BuildArgs {
  fromPubkey: Buffer;
  toPubkey: Buffer;
  body: string;
  in_reply_to?: string | null;
  now?: string;
}

export function buildUnsigned(args: BuildArgs): UnsignedEnvelope {
  return {
    id: ulid(),
    version: PROTOCOL_VERSION,
    from: encodeBase32(args.fromPubkey),
    to: encodeBase32(args.toPubkey),
    timestamp: args.now ?? nowIso(),
    in_reply_to: args.in_reply_to ?? null,
    body: args.body,
  };
}

export function signEnvelope(
  unsigned: UnsignedEnvelope,
  privateKey: Buffer,
  publicKey: Buffer,
): Envelope {
  const bytes = canonicalBytes(unsigned as unknown as Json);
  const sig = signBytes(bytes, privateKey, publicKey);
  return {
    ...unsigned,
    signature: { algorithm: 'ed25519', value: sig.toString('base64') },
  };
}

export function parseEnvelope(raw: unknown): Envelope {
  const result = EnvelopeSchema.safeParse(raw);
  if (!result.success) {
    throw BadEnvelope(
      `malformed envelope: ${result.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  return result.data;
}

export function fromAddrPubkey(envelope: Envelope): Buffer {
  return Buffer.from(decodeBase32(envelope.from));
}

export function toAddrPubkey(envelope: Envelope): Buffer {
  return Buffer.from(decodeBase32(envelope.to));
}

export function verifyEnvelopeSignature(envelope: Envelope, publicKey: Buffer): boolean {
  const { signature, ...unsigned } = envelope;
  const bytes = canonicalBytes(unsigned as unknown as Json);
  let sig: Buffer;
  try {
    sig = Buffer.from(signature.value, 'base64');
  } catch {
    return false;
  }
  return verifyBytes(bytes, sig, publicKey);
}

export function verifyOrThrow(envelope: Envelope, publicKey: Buffer): void {
  if (!verifyEnvelopeSignature(envelope, publicKey)) {
    throw BadSignature();
  }
}
