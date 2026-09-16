import 'server-only';
import nodemailer from 'nodemailer';
import { after } from 'next/server';
import { db, checked } from './db';
import { appUrl, decrypt, required } from './secrets';
import { payloadSchema } from './validation';
import { mailContent } from './mail-content';
import type { Event, Registration } from './types';
type Job = {
  id: string;
  registration_id: string;
  kind: string;
  attempts: number;
  lease_token: string;
};
export function scheduleMail() {
  after(async () => {
    try {
      await processMail();
    } catch {
      console.error('Mail queue processing failed');
    }
  });
}
export async function processMail() {
  // Test/development mode leaves jobs pending and never sends or logs their contents.
  if (process.env.MAIL_DISABLED === 'true') return { sent: 0, disabled: true };
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: required('GMAIL_ACCOUNT'),
      pass: required('GMAIL_APP_PASSWORD'),
    },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  const jobs = checked(await db().rpc('rsvp_lease_mail')) as Job[];
  let sent = 0;
  await Promise.all(
    jobs.map(async (job) => {
      const finish = () =>
        db()
          .from('rsvp_mail_jobs')
          .delete()
          .eq('id', job.id)
          .eq('lease_token', job.lease_token);
      try {
        const row = checked(
          await db()
            .from('rsvp_registrations')
            .select('*')
            .eq('id', job.registration_id),
        )[0] as Registration | undefined;
        if (!row) {
          checked(await finish());
          return;
        }
        const event = checked(
          await db().from('rsvp_events').select('*').eq('id', row.event_id),
        )[0] as Event;
        if (
          !event ||
          event.purged_at ||
          new Date(event.delete_at) <= new Date()
        ) {
          checked(await finish());
          return;
        }
        if (
          ['confirmed', 'waitlisted', 'declined'].includes(job.kind) &&
          row.status !== job.kind
        ) {
          checked(await finish());
          return;
        }
        if (job.kind === 'opening') {
          const confirmed = checked(
            await db()
              .from('rsvp_registrations')
              .select('seats')
              .eq('event_id', event.id)
              .eq('status', 'confirmed'),
          );
          if (
            row.status !== 'waitlisted' ||
            new Date(event.starts_at) <= new Date() ||
            event.capacity - confirmed.reduce((n, r) => n + r.seats, 0) <
              row.seats
          ) {
            checked(await finish());
            return;
          }
        }
        const { details, token } = payloadSchema.parse(
          await decrypt(row.encrypted, event.id),
        );
        if (!details.email) {
          checked(await finish());
          return;
        }
        const link = `${appUrl()}/e/${event.slug}#manage=${token}`;
        await transport.sendMail({
          from: {
            name: 'Queer Support · APAIT',
            address: required('GMAIL_ACCOUNT'),
          },
          to: details.email,
          messageId: `<${job.id}@${new URL(appUrl()).hostname}>`,
          ...mailContent(event, row, job.kind, link),
        });
        checked(await finish());
        sent++;
      } catch {
        // Delivery is at-least-once. A fixed Message-ID helps identify retries after ambiguous SMTP failures.
        checked(
          await db()
            .from('rsvp_mail_jobs')
            .update({
              leased_until: null,
              lease_token: null,
              available_at: new Date(
                Date.now() + Math.min(3600, 2 ** job.attempts * 30) * 1000,
              ).toISOString(),
            })
            .eq('id', job.id)
            .eq('lease_token', job.lease_token),
        );
        console.error('Email delivery attempt failed; queued for retry');
      }
    }),
  );
  transport.close();
  return { sent, disabled: false };
}
