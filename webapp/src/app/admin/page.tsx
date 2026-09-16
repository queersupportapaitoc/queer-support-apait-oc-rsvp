import Link from 'next/link';
import { redirect } from 'next/navigation';
import { adminSession } from '@/lib/auth';
import { allRows } from '@/lib/db';
import { eventTime } from '@/lib/time';
import { Logout } from '@/components/AdminControls';
import type { Event } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function Admin() {
  if (!(await adminSession())) redirect('/admin/login');
  const events = (await allRows<Event>('rsvp_events', 'starts_at')).reverse();
  return (
    <div className="admin-shell">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Organizer dashboard</span>
          <h1>Your events</h1>
        </div>
        <div className="button-row">
          <Logout />
          <Link className="button" href="/admin/events/new">
            Create an event <span aria-hidden="true">+</span>
          </Link>
        </div>
      </div>
      {events.length === 0 ? (
        <section className="card empty-state">
          <span className="big-star" aria-hidden="true">
            ✳
          </span>
          <h2>No events yet</h2>
          <p>Create your first event to get a shareable RSVP link.</p>
          <Link className="button" href="/admin/events/new">
            Create an event
          </Link>
        </section>
      ) : (
        <div className="event-grid">
          {events.map((event) => {
            const expired =
              !!event.purged_at || new Date(event.delete_at) <= new Date();
            return (
              <Link
                className="card event-tile"
                key={event.id}
                href={`/admin/events/${event.id}`}
              >
                <span
                  className={`pill ${expired ? 'muted' : new Date(event.starts_at) <= new Date() ? 'muted' : 'confirmed'}`}
                >
                  {expired
                    ? 'Participant data expired'
                    : new Date(event.starts_at) <= new Date()
                      ? 'Signups closed'
                      : 'Upcoming'}
                </span>
                <h2>{event.title}</h2>
                <p>{eventTime(event.starts_at)}</p>
                <p className="help">{event.location}</p>
                <div className="tile-footer">
                  <span>Capacity: {event.capacity} people</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
