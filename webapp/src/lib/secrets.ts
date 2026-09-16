import 'server-only';
import {
  createPrivateKey,
  createPublicKey,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { fromBase64 } from './crypto';
import type { Envelope } from './types';
export function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing server configuration: ${key}`);
  return value;
}
export function appUrl(): string {
  return required('APP_URL').replace(/\/$/, '');
}
export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}
export function fingerprint(value: string): string {
  return createHmac('sha256', required('RATE_LIMIT_SECRET'))
    .update(value)
    .digest('hex');
}
let privateKey: CryptoKey | undefined;
let jwk: JsonWebKey | undefined;
function keyObject() {
  return createPrivateKey(
    Buffer.from(required('RSVP_PRIVATE_KEY'), 'base64').toString(),
  );
}
export function publicKey(): JsonWebKey {
  return (jwk ??= createPublicKey(keyObject()).export({
    format: 'jwk',
  }) as JsonWebKey);
}
export async function decrypt(
  envelope: Envelope,
  context: string,
): Promise<unknown> {
  privateKey ??= await crypto.subtle.importKey(
    'pkcs8',
    new Uint8Array(keyObject().export({ type: 'pkcs8', format: 'der' })),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['unwrapKey'],
  );
  const aes = await crypto.subtle.unwrapKey(
    'raw',
    fromBase64(envelope.key),
    privateKey,
    'RSA-OAEP',
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const bytes = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(envelope.iv),
      additionalData: new TextEncoder().encode(context),
    },
    aes,
    fromBase64(envelope.data),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
