import type { Event, Registration } from './types';
import { eventTime } from './time';
export function mailContent(
  event: Event,
  row: Pick<Registration, 'status' | 'seats'>,
  kind: string,
  link: string,
) {
  const heading =
    kind === 'opening'
      ? 'A spot is available — claim your RSVP'
      : kind === 'updated'
        ? 'Your event details have changed'
        : row.status === 'confirmed'
          ? 'Your RSVP is confirmed'
          : row.status === 'waitlisted'
            ? 'You’re on the waitlist'
            : 'Your response has been received';
  const explanation =
    kind === 'opening'
      ? `There is currently room for your party. Open the link below and choose “Claim ${row.seats === 2 ? 'two spots' : 'my spot'}”. Openings are first come, first served and are not reserved by this email.`
      : row.status === 'confirmed'
        ? `You have ${row.seats === 2 ? 'two confirmed places' : 'a confirmed place'} at ${event.title}.`
        : row.status === 'waitlisted'
          ? `Your party of ${row.seats} is on the waitlist. We’ll email when there’s room to claim a place. You are not confirmed until you claim an opening.`
          : 'You told us you can’t make it. No seat has been reserved.';
  return {
    subject: `${event.title}: ${heading}`,
    text: `${heading}\n\n${explanation}\n\n${event.title}\n${eventTime(event.starts_at)}\n${event.location}\n\nManage or remove your RSVP:\n${link}\n`,
  };
}
