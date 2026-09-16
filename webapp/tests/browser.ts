import puppeteer, { type Page } from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { hashPassword } from '../src/lib/password';
process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
if (process.env.MAIL_DISABLED !== 'true')
  throw Error('Browser tests require MAIL_DISABLED=true.');
const base = process.env.APP_URL || 'http://localhost:3000';
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const artifacts = new URL('../../.local/screenshots/', import.meta.url)
  .pathname;
await mkdir(artifacts, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const password = randomUUID() + randomUUID();
const username = `test-${randomUUID()}`;
const admin = await client
  .from('rsvp_admins')
  .insert({ username, password_hash: await hashPassword(password) })
  .select('id')
  .single();
assert.equal(admin.error, null);
let eventId: string | undefined;
const errors: string[] = [];
async function page() {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Content Security Policy|Hydration|hydration/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.setViewport({ width: 1440, height: 1100 });
  return page;
}
async function text(page: Page, value: string) {
  try {
    await page.waitForFunction(
      (value) => document.body.innerText.includes(value),
      { timeout: 15000 },
      value,
    );
  } catch {
    console.error(
      'Expected text:',
      value,
      'Visible alert:',
      await page
        .$eval('[role=alert]', (e) => e.textContent)
        .catch(() => '(none)'),
    );
    throw Error('Browser assertion failed');
  }
}
async function clickText(page: Page, value: string) {
  await page.evaluate((value) => {
    const el = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === value,
    );
    if (!el) throw Error(`Button missing: ${value}`);
    el.click();
  }, value);
}
try {
  const organizer = await page();
  await organizer.goto(`${base}/admin`, { waitUntil: 'networkidle0' });
  assert.ok(organizer.url().endsWith('/admin/login'));
  await organizer.type('[name=username]', username);
  await organizer.type('[name=password]', password);
  await organizer.click('button[type=submit], form button');
  await organizer.waitForFunction(() => location.pathname === '/admin');
  await organizer.goto(`${base}/admin/events/new`, {
    waitUntil: 'networkidle0',
  });
  await organizer.$eval('[name=title]', (el) => {
    (el as HTMLInputElement).value = '';
  });
  await organizer.type('[name=title]', 'Queer Support');
  await organizer.$eval('[name=capacity]', (el) => {
    (el as HTMLInputElement).value = '2';
  });
  await organizer.click('button[type=submit]');
  await organizer.waitForFunction(() =>
    /\/admin\/events\/[a-f0-9-]{36}$/.test(location.pathname),
  );
  eventId = organizer.url().split('/').pop();
  const event = await client
    .from('rsvp_events')
    .select('*')
    .eq('id', eventId)
    .single();
  assert.equal(event.error, null);
  assert.equal(event.data.capacity, 2);
  const url = `${base}/e/${event.data.slug}`;
  const first = await page();
  await first.goto(url, { waitUntil: 'networkidle0' });
  await text(first, '2 spots available');
  await first.screenshot({
    path: `${artifacts}/rsvp-desktop.png`,
    fullPage: true,
  });
  await first.setViewport({ width: 390, height: 844 });
  await first.screenshot({
    path: `${artifacts}/rsvp-mobile.png`,
    fullPage: true,
  });
  assert.equal(
    await first.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    'No mobile horizontal overflow',
  );
  await first.type('[name=name]', 'Synthetic Pair');
  await first.click('[name=attendance][value=friend]');
  await first.type('[name=friend]', 'Synthetic Friend (they/them)');
  const submitted = first.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/api/events/'),
  );
  await first.click('button[type=submit]');
  const wire = (await submitted).postData()!;
  assert.ok(!wire.includes('Synthetic Pair'));
  assert.ok(!wire.includes('Synthetic Friend'));
  await text(first, 'There’s room for both of you.');
  const cookies = await first.browserContext().cookies();
  const cookie = cookies.find((c) => c.name.startsWith('qs_'));
  assert.ok(cookie?.httpOnly);
  assert.equal(cookie?.sameSite, 'Lax');
  await first.reload({ waitUntil: 'networkidle0' });
  await text(first, 'There’s room for both of you.');
  const second = await page();
  await second.goto(url, { waitUntil: 'networkidle0' });
  await text(second, 'This event is full');
  const replay = JSON.parse(wire);
  delete replay.token;
  assert.equal(
    await second.evaluate(
      async ({ endpoint, body }) =>
        (
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        ).status,
      { endpoint: `/api/events/${event.data.slug}`, body: replay },
    ),
    400,
    'A stored encrypted envelope is not proof of its management token',
  );
  await second.type('[name=name]', 'Synthetic Waitlisted Guest');
  await second.click('[name=attendance][value=yes]');
  await second.click('button[type=submit]');
  await text(second, 'A little patience. A place to belong.');
  await first.click('.danger-text');
  await clickText(first, 'Yes, remove it');
  await text(first, 'Your response has been removed.');
  await clickText(second, 'Check availability');
  await text(second, 'Claim my spot');
  await clickText(second, 'Claim my spot');
  await text(second, 'We’ll see you there.');
  const secondCookie = (await second.browserContext().cookies()).find((c) =>
    c.name.startsWith('qs_'),
  )!;
  const recovered = await page();
  await recovered.goto(`${url}#manage=${secondCookie.value}`, {
    waitUntil: 'networkidle0',
  });
  await text(recovered, 'We’ll see you there.');
  assert.equal(new URL(recovered.url()).hash, '');
  // Opening an emailed management link must not perform a cancellation.
  assert.equal(
    (
      await client
        .from('rsvp_registrations')
        .select('id')
        .eq('event_id', eventId)
    ).data?.length,
    1,
  );
  const csrf = await recovered.evaluate(async () => {
    const r = await fetch(
      location.origin + '/api/events/' + location.pathname.split('/').pop(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"action":"cancel"}',
      },
    );
    return r.status;
  });
  assert.equal(csrf, 400);
  await organizer.reload({ waitUntil: 'networkidle0' });
  await text(organizer, 'Synthetic Waitlisted Guest');
  assert.ok(!(await organizer.content()).includes('Synthetic Pair'));
  await organizer.screenshot({
    path: `${artifacts}/admin-roster.png`,
    fullPage: true,
  });
  // Exercise the manual-entry form through the organizer UI.
  await organizer.evaluate(() => {
    const el = [...document.querySelectorAll('summary')].find(
      (e) => e.textContent === 'Add someone manually',
    ) as HTMLElement;
    el.click();
  });
  await organizer.type('[name=name]', 'Synthetic Manual Guest');
  await organizer.click('[name=attendance][value=yes]');
  await clickText(organizer, 'Add response');
  await text(organizer, 'Response added.');
  await text(organizer, 'Synthetic Manual Guest');
  const manual = (
    await client
      .from('rsvp_registrations')
      .select('id,status')
      .eq('event_id', eventId)
  ).data;
  assert.equal(manual?.length, 2);
  assert.ok(manual?.every((r) => r.status === 'confirmed'));
  // Organizer removal releases the place, and edited capacity is persisted.
  organizer.once('dialog', (dialog) => {
    void dialog.accept();
  });
  await organizer.evaluate(() => {
    const row = [...document.querySelectorAll('article')].find((el) =>
      el.textContent?.includes('Synthetic Manual Guest'),
    )!;
    (row.querySelector('.danger-text') as HTMLButtonElement).click();
  });
  await organizer.waitForFunction(
    () => !document.body.innerText.includes('Synthetic Manual Guest'),
  );
  assert.equal(
    (
      await client
        .from('rsvp_registrations')
        .select('id')
        .eq('event_id', eventId)
    ).data?.length,
    1,
  );
  await organizer.evaluate(() => {
    (
      [...document.querySelectorAll('summary')].find(
        (el) => el.textContent === 'Edit event details',
      ) as HTMLElement
    ).click();
  });
  await organizer.$eval('[name=capacity]', (el) => {
    (el as HTMLInputElement).value = '1';
  });
  await organizer.click('.event-editor button[type=submit]');
  await text(organizer, 'Event updated.');
  assert.equal(
    (
      await client
        .from('rsvp_events')
        .select('capacity')
        .eq('id', eventId)
        .single()
    ).data?.capacity,
    1,
  );
  const deletable = await client
    .from('rsvp_events')
    .insert({
      title: 'Synthetic event to delete',
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      delete_at: new Date(Date.now() + 172800000).toISOString(),
      capacity: 1,
    })
    .select('id')
    .single();
  assert.equal(deletable.error, null);
  await organizer.goto(`${base}/admin/events/${deletable.data!.id}`, {
    waitUntil: 'networkidle0',
  });
  organizer.once('dialog', (dialog) => void dialog.accept());
  await clickText(organizer, 'Delete event');
  await organizer.waitForFunction(() => location.pathname === '/admin');
  assert.equal(
    (await client.from('rsvp_events').select('id').eq('id', deletable.data!.id))
      .data?.length,
    0,
  );
  await organizer.goto(`${base}/admin/events/${eventId}`, {
    waitUntil: 'networkidle0',
  });
  // Expired records cannot be recovered even before the cron purge executes.
  await client
    .from('rsvp_events')
    .update({
      starts_at: new Date(Date.now() - 7200000).toISOString(),
      delete_at: new Date(Date.now() - 3600000).toISOString(),
    })
    .eq('id', eventId);
  await recovered.reload({ waitUntil: 'networkidle0' });
  await text(recovered, 'This event has ended.');
  await organizer.reload({ waitUntil: 'networkidle0' });
  await text(organizer, 'Participant information has expired.');
  assert.ok(!(await organizer.content()).includes('Synthetic Manual Guest'));
  await client.rpc('rsvp_purge_expired');
  assert.equal(
    (
      await client
        .from('rsvp_registrations')
        .select('id')
        .eq('event_id', eventId)
    ).data?.length,
    0,
  );
  assert.equal(
    (await client.from('rsvp_events').select('id').eq('id', eventId)).data
      ?.length,
    0,
  );
  const updatedUsername = `updated-${randomUUID()}`;
  const updatedPassword = `${randomUUID()}${randomUUID()}`;
  await organizer.goto(`${base}/admin`, { waitUntil: 'networkidle0' });
  await organizer.evaluate(() => {
    const summary = [...document.querySelectorAll('summary')].find(
      (element) => element.textContent === 'Organizer account',
    ) as HTMLElement;
    summary.click();
  });
  await organizer.$eval('[name=username]', (element) => {
    (element as HTMLInputElement).value = '';
  });
  await organizer.type('[name=username]', updatedUsername);
  await organizer.type('[name=currentPassword]', password);
  await organizer.type('[name=newPassword]', updatedPassword);
  await organizer.type('[name=confirmPassword]', updatedPassword);
  await clickText(organizer, 'Update credentials');
  await text(organizer, 'Organizer credentials updated');
  await clickText(organizer, 'Sign out');
  await organizer.waitForFunction(() => location.pathname === '/admin/login');
  await organizer.type('[name=username]', updatedUsername);
  await organizer.type('[name=password]', updatedPassword);
  await organizer.click('button[type=submit], form button');
  await organizer.waitForFunction(() => location.pathname === '/admin');
  assert.deepEqual(errors, [], 'No client-side JavaScript errors');
  console.log(
    'Browser checks passed: organizer login/create/manual entry, encrypted signup, pair capacity, no-email return, waitlist claim, private-link recovery, event deletion, expiry, account updates, and mobile layout.',
  );
  console.log('Screenshots saved in ignored .local/screenshots/.');
} finally {
  if (eventId) await client.from('rsvp_events').delete().eq('id', eventId);
  await client.from('rsvp_admins').delete().eq('id', admin.data!.id);
  await browser.close();
}
