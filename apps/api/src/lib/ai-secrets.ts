import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function deriveKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

export function encryptAiSecret(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptAiSecret(value: string | null | undefined, secret: string) {
  if (!value) return '';
  const [ivPart, tagPart, ciphertextPart] = value.split('.');
  if (!ivPart || !tagPart || !ciphertextPart) {
    return '';
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64')),
      decipher.final()
    ]).toString('utf8');
    return plaintext.trim();
  } catch {
    return '';
  }
}
