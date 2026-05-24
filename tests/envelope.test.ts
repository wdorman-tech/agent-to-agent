import { describe, expect, test } from 'vitest';
import { generateEd25519 } from '../src/identity/keys.js';
import {
  buildUnsigned,
  parseEnvelope,
  signEnvelope,
  verifyEnvelopeSignature,
} from '../src/protocol/envelope.js';

describe('envelope sign + verify', () => {
  test('signed envelope verifies against the signer', () => {
    const { publicKeyRaw, privateKeyRaw } = generateEd25519();
    const other = generateEd25519();
    const env = signEnvelope(
      buildUnsigned({
        fromPubkey: publicKeyRaw,
        toPubkey: other.publicKeyRaw,
        body: 'hello',
      }),
      privateKeyRaw,
      publicKeyRaw,
    );
    expect(verifyEnvelopeSignature(env, publicKeyRaw)).toBe(true);
  });

  test('body tampering invalidates signature', () => {
    const me = generateEd25519();
    const them = generateEd25519();
    const env = signEnvelope(
      buildUnsigned({
        fromPubkey: me.publicKeyRaw,
        toPubkey: them.publicKeyRaw,
        body: 'hello',
      }),
      me.privateKeyRaw,
      me.publicKeyRaw,
    );
    const tampered = JSON.parse(JSON.stringify(env));
    tampered.body = 'goodbye';
    expect(verifyEnvelopeSignature(tampered, me.publicKeyRaw)).toBe(false);
  });

  test('a different public key fails to verify', () => {
    const me = generateEd25519();
    const them = generateEd25519();
    const attacker = generateEd25519();
    const env = signEnvelope(
      buildUnsigned({
        fromPubkey: me.publicKeyRaw,
        toPubkey: them.publicKeyRaw,
        body: 'x',
      }),
      me.privateKeyRaw,
      me.publicKeyRaw,
    );
    expect(verifyEnvelopeSignature(env, attacker.publicKeyRaw)).toBe(false);
  });

  test('parse rejects malformed', () => {
    expect(() => parseEnvelope({ id: 'x' })).toThrow();
    expect(() =>
      parseEnvelope({
        id: 'short',
        version: '0.1',
        from: 'not-base32!',
        to: 'aaa',
        timestamp: 'now',
        in_reply_to: null,
        body: 'hi',
        signature: { algorithm: 'ed25519', value: 'aa' },
      }),
    ).toThrow();
  });
});
