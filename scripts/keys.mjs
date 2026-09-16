import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { root } from './env.mjs';
if (process.env.RSVP_PRIVATE_KEY)
  throw new Error('Encryption key already exists; refusing to replace it.');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
fs.appendFileSync(
  path.join(root, '.env'),
  `\nRSVP_PRIVATE_KEY=${Buffer.from(pem).toString('base64')}\nRATE_LIMIT_SECRET=${randomBytes(32).toString('hex')}\nCRON_SECRET=${randomBytes(32).toString('hex')}\nAPP_URL=http://localhost:3000\n`,
);
fs.chmodSync(path.join(root, '.env'), 0o600);
console.log(
  'Generated encryption and application secrets in ignored .env. Back up the private key securely.',
);
