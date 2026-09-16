import { required, sql } from './env.mjs';
const url = new URL(required('APP_URL'));
if (url.protocol !== 'https:' || /^(localhost|127\.)/.test(url.hostname))
  throw new Error(
    'Set APP_URL to the deployed HTTPS origin before configuring email retries.',
  );
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const secret = required('CRON_SECRET');
// Vault keeps the bearer secret out of the cron command and source control.
try {
  await sql(`begin;
 create extension if not exists pg_net;
 revoke all on schema net from public, anon, authenticated;
 revoke all on all tables in schema net from public, anon, authenticated;
 revoke all on all sequences in schema net from public, anon, authenticated;
 do $$ begin
 if exists(select 1 from vault.secrets where name='rsvp_mail_cron') then
   perform vault.update_secret((select id from vault.secrets where name='rsvp_mail_cron'),${quote(secret)});
 else perform vault.create_secret(${quote(secret)},'rsvp_mail_cron','RSVP mail worker bearer token'); end if;
 end $$;
 select cron.schedule('rsvp-mail','* * * * *',${quote(`select net.http_get(url := '${url.origin}/api/cron', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='rsvp_mail_cron')), timeout_milliseconds := 60000);`)});
 commit;`);
  console.log(
    'Configured the minutely email worker. Retention already runs directly in PostgreSQL.',
  );
} catch {
  throw new Error(
    'Cron setup failed. Check pg_net/Vault availability and management-token permissions.',
  );
}
