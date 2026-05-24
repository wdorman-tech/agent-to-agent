import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';

export interface RawKeyPair {
  publicKeyRaw: Buffer; // 32 bytes
  privateKeyRaw: Buffer; // 32 bytes (Ed25519 seed)
}

export function generateEd25519(): RawKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyRaw: rawPublic(publicKey),
    privateKeyRaw: rawPrivate(privateKey),
  };
}

export function rawPublic(key: KeyObject): Buffer {
  const jwk = key.export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('JWK missing x (public key bytes)');
  return Buffer.from(jwk.x, 'base64url');
}

export function rawPrivate(key: KeyObject): Buffer {
  const jwk = key.export({ format: 'jwk' }) as { d?: string };
  if (!jwk.d) throw new Error('JWK missing d (private key bytes) — key is not a private key');
  return Buffer.from(jwk.d, 'base64url');
}

export function importPublic(raw: Buffer): KeyObject {
  if (raw.length !== 32) throw new Error('Ed25519 public key must be 32 bytes');
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
}

export function importPrivate(raw: Buffer, publicRaw?: Buffer): KeyObject {
  if (raw.length !== 32) throw new Error('Ed25519 private key seed must be 32 bytes');
  return createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      d: raw.toString('base64url'),
      x: (publicRaw ?? Buffer.alloc(0)).toString('base64url'),
    },
    format: 'jwk',
  });
}
