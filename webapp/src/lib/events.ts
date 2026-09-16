import 'server-only';
import { db, checked } from './db';
import { participantHash } from './auth';
import type { Event, Registration, PublicState } from './types';
export async function getEvent(slug: string): Promise<Event> {
  const rows = checked(
    await db().from('rsvp_events').select('*').eq('slug', slug),
  );
  if (!rows[0]) throw new Error('NOT_FOUND');
  return rows[0] as Event;
}
export async function ownRegistration(
  event: Event,
): Promise<Registration | null> {
  if (new Date(event.delete_at) <= new Date() || event.purged_at) return null;
  const tokenHash = await participantHash(event.id);
  if (!tokenHash) return null;
  return (
    (checked(
      await db()
        .from('rsvp_registrations')
        .select('*')
        .eq('event_id', event.id)
        .eq('token_hash', tokenHash),
    )[0] as Registration) || null
  );
}
export async function publicState(event: Event): Promise<PublicState> {
  const expired = !!event.purged_at || new Date(event.delete_at) <= new Date();
  if (expired)
    return {
      event,
      available: 0,
      waitlisted: 0,
      closed: true,
      expired: true,
      registration: null,
    };
  const summary = checked(
    await db().rpc('rsvp_event_summary', { p_event: event.id }),
  );
  const own = await ownRegistration(event);
  return {
    event,
    available: Math.max(0, event.capacity - summary.confirmed),
    waitlisted: summary.waitlisted,
    closed: new Date(event.starts_at) <= new Date(),
    expired: false,
    registration: own
      ? { status: own.status, seats: own.seats, hasEmail: own.has_email }
      : null,
  };
}
