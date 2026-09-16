import { Temporal } from '@js-temporal/polyfill';
export const TIME_ZONE = 'America/Los_Angeles';
export function localToInstant(value: string): string {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(TIME_ZONE, { disambiguation: 'reject' })
    .toInstant()
    .toString();
}
export function toLocalInput(value: string): string {
  return Temporal.Instant.from(value)
    .toZonedDateTimeISO(TIME_ZONE)
    .toPlainDateTime()
    .toString({ smallestUnit: 'minute' });
}
export function defaultDeletion(localStart: string): string {
  return Temporal.PlainDateTime.from(localStart)
    .toPlainDate()
    .add({ days: 1 })
    .toPlainDateTime('00:00')
    .toString({ smallestUnit: 'minute' });
}
export function nextThursday(): string {
  let day = Temporal.Now.zonedDateTimeISO(TIME_ZONE).toPlainDate();
  do {
    day = day.add({ days: 1 });
  } while (day.dayOfWeek !== 4);
  return day.toPlainDateTime('18:00').toString({ smallestUnit: 'minute' });
}
export function eventTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}
