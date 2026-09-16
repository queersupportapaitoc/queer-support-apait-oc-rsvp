import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, fromBase64, randomToken } from '../src/lib/crypto';
import { defaultDeletion, localToInstant, toLocalInput } from '../src/lib/time';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { payloadSchema, usernameSchema } from '../src/lib/validation';
test('browser envelope round-trips and authenticates its event context', async () => {
  const rsa = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['wrapKey', 'unwrapKey'],
  );
  const publicKey = await crypto.subtle.exportKey('jwk', rsa.publicKey);
  const payload = { name: 'Test Person', email: 'test@example.invalid' };
  const envelope = await encrypt(publicKey, payload, 'event-a');
  assert.ok(!JSON.stringify(envelope).includes(payload.name));
  const aes = await crypto.subtle.unwrapKey(
    'raw',
    fromBase64(envelope.key),
    rsa.privateKey,
    'RSA-OAEP',
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const decrypt = (context: string) =>
    crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(envelope.iv),
        additionalData: new TextEncoder().encode(context),
      },
      aes,
      fromBase64(envelope.data),
    );
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(await decrypt('event-a'))),
    payload,
  );
  await assert.rejects(decrypt('event-b'));
  const broken = fromBase64(envelope.data);
  broken[0] ^= 1;
  await assert.rejects(
    crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(envelope.iv),
        additionalData: new TextEncoder().encode('event-a'),
      },
      aes,
      broken,
    ),
  );
});
test('Pacific midnight defaults and daylight saving time are explicit', () => {
  assert.equal(defaultDeletion('2026-09-17T18:00'), '2026-09-18T00:00');
  assert.equal(localToInstant('2026-09-18T00:00'), '2026-09-18T07:00:00Z');
  assert.equal(localToInstant('2026-12-18T00:00'), '2026-12-18T08:00:00Z');
  assert.equal(toLocalInput('2026-09-18T07:00:00Z'), '2026-09-18T00:00');
  assert.throws(() => localToInstant('2026-03-08T02:30'));
  assert.throws(() => localToInstant('2026-11-01T01:30'));
});
test('admin password hashes use independent salts and reject wrong passwords', async () => {
  const a = await hashPassword('a sufficiently long password');
  const b = await hashPassword('a sufficiently long password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('a sufficiently long password', a), true);
  assert.equal(await verifyPassword('wrong password', a), false);
});
test('required participant fields and management tokens are validated', () => {
  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const details = {
    name: 'Test',
    attendance: 'yes',
    friend: '',
    comments: '',
    pronouns: '',
    email: '',
  };
  assert.ok(payloadSchema.safeParse({ details, token }).success);
  assert.ok(
    !payloadSchema.safeParse({ details: { ...details, name: '' }, token })
      .success,
  );
  assert.ok(
    !payloadSchema.safeParse({
      details: { ...details, attendance: undefined },
      token,
    }).success,
  );
  assert.ok(
    !payloadSchema.safeParse({
      details: { ...details, email: 'invalid' },
      token,
    }).success,
  );
});

test('organizer usernames are normalized and constrained', () => {
  assert.equal(usernameSchema.parse(' Vivian.Wing '), 'vivian.wing');
  assert.equal(usernameSchema.safeParse('no spaces').success, false);
  assert.equal(usernameSchema.safeParse('ab').success, false);
});

test('confirmation and waitlist emails describe status and link to explicit management', async () => {
  const { mailContent } = await import('../src/lib/mail-content');
  const event = {
    id: 'test',
    slug: 'test',
    title: 'Queer Support',
    location: 'APAIT · Garden Grove, CA',
    starts_at: '2026-09-18T01:00:00Z',
    delete_at: '2026-09-18T07:00:00Z',
    capacity: 15,
    revision: 1,
    purged_at: null,
    created_at: '2026-09-15T01:00:00Z',
  };
  const link = 'https://example.invalid/e/test#manage=private-test-token';
  const confirmed = mailContent(
    event,
    { status: 'confirmed', seats: 2 },
    'confirmed',
    link,
  );
  assert.match(confirmed.subject, /confirmed/);
  assert.match(confirmed.text, /two confirmed places/);
  assert.match(confirmed.text, /6:00 PM PDT/);
  assert.ok(confirmed.text.includes(link));
  const waiting = mailContent(
    event,
    { status: 'waitlisted', seats: 1 },
    'waitlisted',
    link,
  );
  assert.match(waiting.text, /not confirmed until you claim/);
  const opening = mailContent(
    event,
    { status: 'waitlisted', seats: 2 },
    'opening',
    link,
  );
  assert.match(opening.text, /first come, first served/);
  assert.match(opening.text, /Claim two spots/);
  assert.ok(opening.text.trimEnd().endsWith(link));
});
