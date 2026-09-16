import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
if (fs.existsSync(path.join(root, '.env')))
  process.loadEnvFile(path.join(root, '.env'));
export function required(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
export async function sql(query) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${required('SUPABASE_PROJECT_ID')}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required('SUPABASE_PAT')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!response.ok)
    throw new Error(
      `Database management request failed (${response.status}): ${await response.text()}`,
    );
  return response.json();
}
