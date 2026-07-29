import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function loadKey(): Buffer {
  const raw = process.env.SESSION_ENCRYPTION_KEY ?? '';
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('SESSION_ENCRYPTION_KEY must be 32 raw bytes encoded as base64');
  }
  return buf;
}

/** AES-256-GCM. Layout: iv(12) | tag(16) | ciphertext */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const key = loadKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
