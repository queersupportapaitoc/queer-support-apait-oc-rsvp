import type { Envelope } from './types';
function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}
export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function randomToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export async function encrypt(
  publicKey: JsonWebKey,
  payload: unknown,
  context: string,
): Promise<Envelope> {
  const rsa = await crypto.subtle.importKey(
    'jwk',
    publicKey,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['wrapKey'],
  );
  const aes = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    aes,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const key = await crypto.subtle.wrapKey('raw', aes, rsa, 'RSA-OAEP');
  return {
    v: 1,
    key: toBase64(new Uint8Array(key)),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
  };
}
