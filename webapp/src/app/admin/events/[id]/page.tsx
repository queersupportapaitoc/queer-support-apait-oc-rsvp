import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { z } from 'zod';
import { adminSession } from '@/lib/auth';
import { db, checked, allRows } from '@/lib/db';
import { appUrl, decrypt } from '@/lib/secrets';
import { payloadSchema } from '@/lib/validation';
import { eventTime } from '@/lib/time';
import EventEditor from '@/components/EventEditor';
import {
  CopyLink,
  RemoveRegistration,
  AddParticipant,
  RetryMail,
  ConfirmRegistration,
  DeleteEvent,
} from '@/components/AdminControls';
import type { Event, Registration } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function ManageEvent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await adminSession())) redirect('/admin/login');
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const event = checked(
    await db().from('rsvp_events').select('*').eq('id', id),
  )[0] as Event | undefined;
  if (!event) notFound();
  const expired = !!event.purged_at || new Date(event.delete_at) <= new Date();
  const rows = expired
    ? []
    : await allRows<Registration>('rsvp_registrations', 'created_at', {
        column: 'event_id',
        value: id,
      });
  const registrations = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      details: payloadSchema.parse(await decrypt(r.encrypted, id)).details,
    })),
  );
  // Check the deadline again after decryption; a slow request must not expose expired answers.
  if (!expired && new Date(event.delete_at) <= new Date())
    redirect(`/admin/events/${id}`);
  const confirmed = rows
    .filter((r) => r.status === 'confirmed')
    .reduce((n, r) => n + r.seats, 0);
  const waiting = rows
    .filter((r) => r.status === 'waitlisted')
    .reduce((n, r) => n + r.seats, 0);
  const summary = checked(
    await db().rpc('rsvp_event_summary', { p_event: id }),
  );
  return (
    <div className="admin-shell">
      <Link className="back-link" href="/admin">
        ← All events
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Event details</span>
          <h1>{event.title}</h1>
          <p>{eventTime(event.starts_at)}</p>
        </div>
        <Link className="button secondary" href={`/e/${event.slug}`}>
          Open RSVP page ↗
        </Link>
      </div>
      <section className="card share-card">
        <h2>Shareable RSVP link</h2>
        <p>Share this link for this event’s signup form.</p>
        <CopyLink url={`${appUrl()}/e/${event.slug}`} />
      </section>
      <div className="stats">
        <div>
          <strong>
            {confirmed}
            <small> / {event.capacity}</small>
          </strong>
          <span>Confirmed people</span>
        </div>
        <div>
          <strong>{waiting}</strong>
          <span>People waiting</span>
        </div>
        <div>
          <strong>{rows.filter((r) => r.status === 'declined').length}</strong>
          <span>Can’t make it</span>
        </div>
      </div>
      {expired ? (
        <section className="card">
          <h2>Participant information has expired.</h2>
          <p>
            The retention deadline has passed. Participant records are
            unavailable, and the scheduled purge will remove this event from the
            live database.
          </p>
        </section>
      ) : (
        <>
          <section className="card roster">
            <div className="section-top">
              <div>
                <h2>The RSVP list</h2>
                <p className="help">
                  People who bring a friend use two spots. Waitlisted guests
                  must claim an opening.
                </p>
              </div>
              <span className="pill muted">Private · Organizers only</span>
            </div>
            {summary.pending_mail > 0 && (
              <div className="note">
                <p>
                  {summary.pending_mail} email
                  {summary.pending_mail === 1 ? '' : 's'} pending
                  {summary.failed_mail > 0
                    ? ' · Some deliveries need attention'
                    : ''}
                  .
                </p>
                {summary.failed_mail > 0 && <RetryMail eventId={id} />}
              </div>
            )}
            {registrations.length === 0 ? (
              <p className="empty-roster">
                No responses yet. Share the link to get things started.
              </p>
            ) : (
              <div className="roster-list">
                {registrations.map((r) => (
                  <article className="roster-person" key={r.id}>
                    <div className="person-heading">
                      <div>
                        <h3>
                          {r.details.name}{' '}
                          {r.details.pronouns && (
                            <small>({r.details.pronouns})</small>
                          )}
                        </h3>
                        <span className={`pill ${r.status}`}>
                          {r.status === 'confirmed'
                            ? 'Confirmed'
                            : r.status === 'waitlisted'
                              ? 'Waitlisted'
                              : 'Not attending'}
                          {r.seats === 2 ? ' · 2 people' : ''}
                        </span>
                      </div>
                      <div className="roster-actions">
                        {r.status === 'waitlisted' &&
                          new Date(event.starts_at) > new Date() && (
                            <ConfirmRegistration
                              eventId={id}
                              id={r.id}
                              seats={r.seats}
                              available={Math.max(
                                0,
                                event.capacity - confirmed,
                              )}
                            />
                          )}
                        <RemoveRegistration
                          eventId={id}
                          id={r.id}
                          name={r.details.name}
                        />
                      </div>
                    </div>
                    {r.details.email && (
                      <p className="participant-email">{r.details.email}</p>
                    )}
                    {r.details.friend && (
                      <p>
                        <strong>Friend: </strong>
                        {r.details.friend}
                      </p>
                    )}
                    {r.details.comments && (
                      <p className="participant-comments">
                        <strong>Notes: </strong>
                        {r.details.comments}
                      </p>
                    )}
                    <p className="help">Signed up {eventTime(r.created_at)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
          <div className="admin-columns">
            <section className="card">
              <details>
                <summary>Edit event details</summary>
                <EventEditor event={event} />
              </details>
            </section>
            <section className="card">
              <details>
                <summary>Add someone manually</summary>
                {new Date(event.starts_at) <= new Date() ? (
                  <p>Signups closed when the event started.</p>
                ) : (
                  <AddParticipant
                    eventId={id}
                    available={Math.max(0, event.capacity - confirmed)}
                  />
                )}
              </details>
            </section>
          </div>
          <p className="help retention-note">
            This event and its participant information will be deleted{' '}
            {eventTime(event.delete_at)}.
          </p>
        </>
      )}
      <section className="card">
        <h2>Delete event</h2>
        <p>
          Permanently remove this event, every RSVP, and all pending emails.
        </p>
        <DeleteEvent eventId={id} title={event.title} />
      </section>
    </div>
  );
}
