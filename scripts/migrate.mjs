import fs from 'node:fs';
import path from 'node:path';
import { root, sql } from './env.mjs';
await sql(
  'create table if not exists public.rsvp_migrations (name text primary key, applied_at timestamptz not null default now()); alter table public.rsvp_migrations enable row level security; revoke all on public.rsvp_migrations from public, anon, authenticated;',
);
const applied = new Set(
  (await sql('select name from public.rsvp_migrations')).map((r) => r.name),
);
for (const name of fs
  .readdirSync(path.join(root, 'database/migrations'))
  .filter((n) => n.endsWith('.sql'))
  .sort()) {
  if (applied.has(name)) continue;
  const migration = fs.readFileSync(
    path.join(root, 'database/migrations', name),
    'utf8',
  );
  // The migration and its ledger entry commit together.
  await sql(
    migration.replace(
      /commit;\s*$/i,
      `insert into public.rsvp_migrations(name) values ('${name.replaceAll("'", "''")}');\ncommit;`,
    ),
  );
  console.log(`Applied ${name}`);
}
