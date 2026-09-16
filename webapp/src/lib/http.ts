import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl, fingerprint } from './secrets';
import { db, checked } from './db';
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
export function assertOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(appUrl()).origin)
    throw new Error('FORBIDDEN');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new Error('INVALID_REQUEST');
}
export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') || 0) > 32768)
    throw new Error('TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_REQUEST');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) {
      await reader.cancel();
      throw new Error('TOO_LARGE');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    throw new Error('INVALID_REQUEST');
  }
}
export async function rateLimit(
  request: Request,
  scope: string,
  limit = 40,
  window = 600,
) {
  // Vercel overwrites x-vercel-forwarded-for. Untrusted forwarded headers aren't used off Vercel.
  const ip = process.env.VERCEL
    ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'
    : 'local';
  const allowed = checked(
    await db().rpc('rsvp_rate_limit', {
      p_key: fingerprint(`${scope}:${ip}`),
      p_limit: limit,
      p_window: window,
    }),
  );
  if (!allowed) throw new Error('RATE_LIMIT');
}
const errors: Record<string, [number, string]> = {
  UNAUTHORIZED: [401, 'Please sign in to continue.'],
  FORBIDDEN: [
    403,
    'This request could not be verified. Refresh the page and try again.',
  ],
  INVALID_REQUEST: [400, 'Please check the form and try again.'],
  INVALID_ENCRYPTION: [
    400,
    'We couldn’t read your encrypted form. Refresh the page and try again.',
  ],
  TOO_LARGE: [413, 'This form is too large. Please shorten your answers.'],
  RATE_LIMIT: [
    429,
    'Too many attempts. Please wait a few minutes and try again.',
  ],
  EVENT_CLOSED: [409, 'Signups and seat claims for this event are closed.'],
  EVENT_EXPIRED: [410, 'This event’s participant information has expired.'],
  NOT_FOUND: [404, 'This event or RSVP is no longer available.'],
  RSVP_NOT_FOUND: [404, 'This RSVP is no longer available.'],
  NOT_WAITLISTED: [409, 'This RSVP is not on the waitlist.'],
  NO_SEATS: [
    409,
    'That opening was just claimed, or there aren’t enough seats for your party. You’re still on the waitlist.',
  ],
  INVALID_DELETION_TIME: [400, 'Choose a future deletion time.'],
  INVALID_LOGIN: [401, 'Username or password is incorrect.'],
  CURRENT_PASSWORD: [401, 'Your current password is incorrect.'],
  USERNAME_TAKEN: [409, 'That username is already in use.'],
};
export function failure(error: unknown) {
  if (error instanceof z.ZodError)
    return json(
      { error: error.issues[0]?.message || 'Please check your entries.' },
      400,
    );
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : '';
  const known = errors[message];
  if (known) return json({ error: known[1] }, known[0]);
  // Do not log database error details, request payloads, tokens, or participant data.
  console.error(
    'RSVP request failed',
    error instanceof Error ? error.name : 'DatabaseError',
  );
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}
export async function route(work: () => Promise<Response>) {
  try {
    return await work();
  } catch (error) {
    return failure(error);
  }
}
