import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { root, required } from './env.mjs';
const username = (process.argv[2] || 'admin').toLowerCase();
if (!/^[a-z0-9_.-]{3,80}$/.test(username))
  throw new Error('Use 3–80 letters, digits, dots, underscores, or hyphens.');
const password =
  process.env.ADMIN_PASSWORD || randomBytes(24).toString('base64url');
if (password.length < 14)
  throw new Error('Password must have at least 14 characters.');
const salt = randomBytes(32).toString('hex');
const password_hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const response = await fetch(
  `${required('SUPABASE_URL')}/rest/v1/rsvp_admins`,
  {
    method: 'POST',
    headers: {
      apikey: required('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: `Bearer ${required('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password_hash }),
  },
);
if (!response.ok)
  throw new Error(
    `Admin creation failed (${response.status}); username may already exist.`,
  );
fs.mkdirSync(path.join(root, '.local'), { recursive: true, mode: 0o700 });
fs.writeFileSync(
  path.join(root, '.local', `admin-${username}.txt`),
  `Username: ${username}\nPassword: ${password}\n`,
  { mode: 0o600 },
);
console.log(
  `Admin created. Credentials saved to ignored .local/admin-${username}.txt`,
);
