import { sign as ed25519Sign, verify as ed25519Verify } from 'node:crypto';
import { importPrivate, importPublic } from './keys.js';

export function signBytes(message: Buffer, privateKeyRaw: Buffer, publicKeyRaw?: Buffer): Buffer {
  const key = importPrivate(privateKeyRaw, publicKeyRaw);
  return ed25519Sign(null, message, key);
}

export function verifyBytes(message: Buffer, signature: Buffer, publicKeyRaw: Buffer): boolean {
  const key = importPublic(publicKeyRaw);
  return ed25519Verify(null, message, key, signature);
}
