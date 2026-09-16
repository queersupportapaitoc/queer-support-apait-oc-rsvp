import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import { encrypt, randomToken } from '../src/lib/crypto';
process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
if (process.env.MAIL_DISABLED !== 'true')
  throw new Error('Integration tests require MAIL_DISABLED=true.');
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const pub = createPublicKey(
  Buffer.from(process.env.RSVP_PRIVATE_KEY!, 'base64').toString(),
).export({ format: 'jwk' }) as JsonWebKey;
const eventIds: string[] = [];
function checked<T>(result: { data: T; error: unknown }): NonNullable<T> {
  assert.equal(result.error, null);
  return result.data as NonNullable<T>;
}
async function event(capacity: number) {
  const e = checked(
    await client
      .from('rsvp_events')
      .insert({
        title: `TEST ${randomUUID()}`,
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        delete_at: new Date(Date.now() + 172800000).toISOString(),
        capacity,
      })
      .select()
      .single(),
  );
  eventIds.push(e.id);
  return e;
}
async function signup(
  eventId: string,
  seats = 1,
  email = true,
  token = randomToken(),
) {
  const payload = {
    token,
    details: {
      name: 'Synthetic integration guest',
      attendance: seats === 0 ? 'no' : seats === 2 ? 'friend' : 'yes',
      friend: '',
      comments: 'TEST ONLY',
      pronouns: 'they/them',
      email: email ? 'synthetic@example.invalid' : '',
    },
  };
  return client.rpc('rsvp_signup', {
    p_event: eventId,
    p_token_hash: createHash('sha256').update(token).digest('hex'),
    p_seats: seats,
    p_has_email: email,
    p_encrypted: await encrypt(pub, payload, eventId),
  });
}
test('live PostgreSQL allocation, cancellation, mail queue, retention, and access controls', async (t) => {
  try {
    await t.test(
      'simultaneous registrations cannot exceed capacity; retry is idempotent',
      async () => {
        const e = await event(3);
        const token = randomToken();
        const pair = checked(await signup(e.id, 2, true, token));
        assert.equal(pair.status, 'confirmed');
        const duplicate = checked(await signup(e.id, 2, true, token));
        assert.equal(duplicate.id, pair.id);
        const races = await Promise.all(
          Array.from({ length: 12 }, () => signup(e.id)),
        );
        assert.equal(
          races.map(checked).filter((r) => r.status === 'confirmed').length,
          1,
        );
        const rows = checked(
          await client
            .from('rsvp_registrations')
            .select('*')
            .eq('event_id', e.id),
        );
        assert.equal(
          rows
            .filter((r) => r.status === 'confirmed')
            .reduce((n, r) => n + r.seats, 0),
          3,
        );
        assert.ok(
          rows.every(
            (r) =>
              !JSON.stringify(r.encrypted).includes(
                'Synthetic integration guest',
              ),
          ),
        );
        const declined = checked(await signup(e.id, 0));
        assert.equal(declined.status, 'declined');
      },
    );
    await t.test(
      'vacancies notify waitlist entries while the first signup or claim takes the opening',
      async () => {
        const e = await event(1);
        const first = checked(await signup(e.id));
        const waiters = await Promise.all([signup(e.id), signup(e.id)]).then(
          (rs) => rs.map(checked),
        );
        checked(
          await client.rpc('rsvp_cancel', {
            p_event: e.id,
            p_registration: first.id,
          }),
        );
        const openings = checked(
          await client
            .from('rsvp_mail_jobs')
            .select('*')
            .in(
              'registration_id',
              waiters.map((w) => w.id),
            )
            .eq('kind', 'opening'),
        );
        assert.equal(openings.length, 2);
        const newcomer = checked(await signup(e.id));
        assert.equal(newcomer.status, 'confirmed');
        const claims = await Promise.all(
          waiters.map((w) =>
            client.rpc('rsvp_claim', { p_event: e.id, p_registration: w.id }),
          ),
        );
        assert.equal(claims.filter((r) => !r.error).length, 0);
        assert.equal(
          claims.filter((r) => r.error?.message === 'NO_SEATS').length,
          2,
        );
        assert.equal(
          checked(
            await client
              .from('rsvp_registrations')
              .select('id')
              .eq('id', first.id),
          ).length,
          0,
        );
        assert.equal(
          checked(
            await client
              .from('rsvp_mail_jobs')
              .select('id')
              .eq('registration_id', first.id),
          ).length,
          0,
        );
      },
    );
    await t.test(
      'pairs need two seats; lowering capacity preserves confirmations',
      async () => {
        const e = await event(2);
        const one = checked(await signup(e.id));
        const pair = checked(await signup(e.id, 2));
        assert.equal(pair.status, 'waitlisted');
        assert.equal(
          (
            await client.rpc('rsvp_claim', {
              p_event: e.id,
              p_registration: pair.id,
            })
          ).error?.message,
          'NO_SEATS',
        );
        checked(
          await client.rpc('rsvp_update_event', {
            p_event: e.id,
            p_title: e.title,
            p_location: e.location,
            p_starts_at: e.starts_at,
            p_delete_at: e.delete_at,
            p_capacity: 3,
          }),
        );
        assert.equal(
          checked(
            await client
              .from('rsvp_mail_jobs')
              .select('*')
              .eq('registration_id', pair.id)
              .eq('kind', 'opening'),
          ).length,
          1,
        );
        checked(
          await client.rpc('rsvp_claim', {
            p_event: e.id,
            p_registration: pair.id,
          }),
        );
        checked(
          await client.rpc('rsvp_update_event', {
            p_event: e.id,
            p_title: e.title,
            p_location: e.location,
            p_starts_at: e.starts_at,
            p_delete_at: e.delete_at,
            p_capacity: 1,
          }),
        );
        const confirmed = checked(
          await client
            .from('rsvp_registrations')
            .select('seats')
            .eq('event_id', e.id)
            .eq('status', 'confirmed'),
        );
        assert.equal(
          confirmed.reduce((n, r) => n + r.seats, 0),
          3,
        );
        assert.ok(one.id);
      },
    );
    await t.test(
      'expiry blocks mutations and deletes the event with its dependent data',
      async () => {
        const e = await event(1);
        const r = checked(await signup(e.id));
        checked(
          await client
            .from('rsvp_events')
            .update({
              starts_at: new Date(Date.now() - 7200000).toISOString(),
              delete_at: new Date(Date.now() - 3600000).toISOString(),
            })
            .eq('id', e.id),
        );
        assert.equal((await signup(e.id)).error?.message, 'EVENT_CLOSED');
        assert.equal(
          (
            await client.rpc('rsvp_claim', {
              p_event: e.id,
              p_registration: r.id,
            })
          ).error?.message,
          'EVENT_CLOSED',
        );
        checked(await client.rpc('rsvp_purge_expired'));
        assert.equal(
          checked(
            await client
              .from('rsvp_registrations')
              .select('*')
              .eq('event_id', e.id),
          ).length,
          0,
        );
        assert.equal(
          checked(
            await client
              .from('rsvp_mail_jobs')
              .select('*')
              .eq('registration_id', r.id),
          ).length,
          0,
        );
        assert.equal(
          checked(await client.from('rsvp_events').select('id').eq('id', e.id))
            .length,
          0,
        );
      },
    );
    await t.test(
      'mail workers lease disjoint batches and exhausted jobs can be retried',
      async () => {
        const e = await event(10);
        await Promise.all(Array.from({ length: 10 }, () => signup(e.id)));
        const batches = await Promise.all([
          client.rpc('rsvp_lease_mail'),
          client.rpc('rsvp_lease_mail'),
        ]);
        const a = checked(batches[0]),
          b = checked(batches[1]);
        assert.ok(a.length <= 5 && b.length <= 5);
        assert.equal(
          new Set([...a, ...b].map((j: { id: string }) => j.id)).size,
          a.length + b.length,
        );
        assert.ok(
          [...a, ...b].every((j: { lease_token: string }) => j.lease_token),
        );
        const registration = checked(
          await client
            .from('rsvp_registrations')
            .select('id')
            .eq('event_id', e.id)
            .limit(1),
        )[0];
        checked(
          await client
            .from('rsvp_mail_jobs')
            .update({ attempts: 8, leased_until: null })
            .eq('registration_id', registration.id),
        );
        checked(await client.rpc('rsvp_retry_mail', { p_event: e.id }));
        assert.equal(
          checked(
            await client
              .from('rsvp_mail_jobs')
              .select('attempts')
              .eq('registration_id', registration.id),
          )[0].attempts,
          0,
        );
      },
    );
    await t.test('database rate limits are atomic', async () => {
      const key = `test-${randomUUID()}`;
      try {
        const checks = await Promise.all(
          Array.from({ length: 10 }, () =>
            client.rpc('rsvp_rate_limit', {
              p_key: key,
              p_limit: 3,
              p_window: 60,
            }),
          ),
        );
        assert.equal(checks.map(checked).filter(Boolean).length, 3);
      } finally {
        checked(await client.from('rsvp_rate_limits').delete().eq('key', key));
      }
    });
    await t.test(
      'anonymous clients cannot read any application table or execute mutations',
      async () => {
        const response = await fetch(
          `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_ID}/api-keys`,
          { headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT}` } },
        );
        assert.ok(response.ok);
        const keys = (await response.json()) as {
          name: string;
          api_key: string;
        }[];
        const anon = createClient(
          process.env.SUPABASE_URL!,
          keys.find((k) => k.name === 'anon')!.api_key,
          { auth: { persistSession: false } },
        );
        for (const table of [
          'rsvp_events',
          'rsvp_registrations',
          'rsvp_mail_jobs',
          'rsvp_admins',
          'rsvp_sessions',
          'rsvp_rate_limits',
        ]) {
          const result = await anon.from(table).select('*');
          assert.ok(result.error, `${table} must be inaccessible`);
        }
        assert.ok((await anon.rpc('rsvp_purge_expired')).error);
        assert.ok((await anon.rpc('rsvp_lease_mail')).error);
      },
    );
  } finally {
    if (eventIds.length)
      checked(await client.from('rsvp_events').delete().in('id', eventIds));
  }
});
