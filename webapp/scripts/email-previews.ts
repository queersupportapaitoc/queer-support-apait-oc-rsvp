import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { mailContent } from '../src/lib/mail-content';
import type { Event, Status } from '../src/lib/types';

// Synthetic data only; render the same HTML content used by the mail worker.
const event: Event = {
  id: 'preview',
  slug: 'preview',
  title: 'Queer Support',
  location: 'APAIT · Garden Grove, CA (sample location)',
  starts_at: '2026-09-25T01:00:00Z',
  delete_at: '2026-09-25T07:00:00Z',
  capacity: 15,
  revision: 1,
  purged_at: null,
  created_at: '2026-09-23T19:00:00Z',
};
const variants: {
  name: string;
  status: Status;
  seats: number;
  kind: string;
}[] = [
  {
    name: 'confirmed-one-person',
    status: 'confirmed',
    seats: 1,
    kind: 'confirmed',
  },
  {
    name: 'confirmed-with-friend',
    status: 'confirmed',
    seats: 2,
    kind: 'confirmed',
  },
  { name: 'waitlisted', status: 'waitlisted', seats: 1, kind: 'waitlisted' },
  {
    name: 'opening-one-person',
    status: 'waitlisted',
    seats: 1,
    kind: 'opening',
  },
  {
    name: 'opening-with-friend',
    status: 'waitlisted',
    seats: 2,
    kind: 'opening',
  },
  { name: 'declined', status: 'declined', seats: 1, kind: 'declined' },
  { name: 'updated-confirmed', status: 'confirmed', seats: 1, kind: 'updated' },
  {
    name: 'updated-waitlisted',
    status: 'waitlisted',
    seats: 1,
    kind: 'updated',
  },
  { name: 'updated-declined', status: 'declined', seats: 1, kind: 'updated' },
];
const directory = new URL('../../.local/email-previews/', import.meta.url);
await mkdir(directory, { recursive: true });
const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const style = `<style>
  @page { size: Letter; margin: 0.3in; }
  body { margin: 0; font: 13px/1.5 Arial, sans-serif; color: #202124; background: #fff; }
  section { break-after: page; }
  section:last-child { break-after: auto; }
  header { border-bottom: 1px solid #dadce0; padding-bottom: 14px; margin-bottom: 18px; }
  header h1 { font-size: 19px; line-height: 1.3; margin: 10px 0; }
  .note { font-size: 11px; color: #666; }
  .body { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>`;
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  const sections: string[] = [];
  for (const variant of variants) {
    const mail = mailContent(
      event,
      variant,
      variant.kind,
      'https://example.invalid/e/preview#manage=sample-private-link',
    );
    const section = `<section><header>
      <div class="note">EMAIL PREVIEW · ${escape(variant.name)} · Sample event and inactive RSVP link</div>
      <h1>${escape(mail.subject)}</h1>
      <div>From: Queer Support · APAIT<br>To: Sample Guest<br>Reply-To: ${escape(mail.replyTo)}</div>
      </header><div>${mail.html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1]}</div></section>`;
    sections.push(section);
    await writeFile(
      new URL(`${variant.name}-email.html`, directory),
      mail.html,
    );
    const html = `<!doctype html><html><meta charset="utf-8">${style}<body>${section}</body></html>`;
    await writeFile(new URL(`${variant.name}.html`, directory), html);
    await page.setContent(html);
    await page.pdf({
      path: new URL(`${variant.name}.pdf`, directory).pathname,
      printBackground: true,
      preferCSSPageSize: true,
      scale: 0.8,
    });
    if (variant.name === 'confirmed-one-person') {
      await page.setViewport({
        width: 816,
        height: 1056,
        deviceScaleFactor: 1,
      });
      await page.screenshot({
        fullPage: true,
        path: new URL('confirmed-one-person.png', directory).pathname,
      });
    }
  }
  await page.setContent(
    `<!doctype html><html><meta charset="utf-8">${style}<body>${sections.join('')}</body></html>`,
  );
  await page.pdf({
    path: new URL('all-email-previews.pdf', directory).pathname,
    printBackground: true,
    preferCSSPageSize: true,
    scale: 0.8,
  });
  console.log(`Email previews saved to ${directory.pathname}`);
} finally {
  await browser.close();
}
