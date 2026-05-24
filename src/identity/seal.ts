import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LEN = 12;
const TAG_LEN = 16;
const ALGO = 'aes-256-gcm';

export function seal(plaintext: Buffer, masterKey: Buffer): Buffer {
  if (masterKey.length !== 32) {
    throw new Error('masterKey must be exactly 32 bytes (AES-256)');
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, masterKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}

export function unseal(blob: Buffer, masterKey: Buffer): Buffer {
  if (masterKey.length !== 32) {
    throw new Error('masterKey must be exactly 32 bytes (AES-256)');
  }
  if (blob.length < IV_LEN + TAG_LEN) {
    throw new Error('sealed blob is too short');
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(IV_LEN, blob.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
