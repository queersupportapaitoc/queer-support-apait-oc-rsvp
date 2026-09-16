import { cookies } from 'next/headers';
import { z } from 'zod';
import { getEvent, ownRegistration, publicState } from '@/lib/events';
import { db, checked } from '@/lib/db';
import { json, route, assertOrigin, readJson, rateLimit } from '@/lib/http';
import { envelopeSchema, payloadSchema, tokenSchema } from '@/lib/validation';
import { decrypt, hash } from '@/lib/secrets';
import { participantCookie, cookieOptions } from '@/lib/auth';
import { scheduleMail } from '@/lib/mail';
import type { Registration } from '@/lib/types';
type Context = { params: Promise<{ slug: string }> };
export const GET = (request: Request, context: Context) =>
  route(async () => {
    const { slug } = await context.params;
    z.uuid().parse(slug);
    const state = await publicState(await getEvent(slug));
    if (state.expired)
      (await cookies()).delete(participantCookie(state.event.id));
    return json(state);
  });
export const POST = (request: Request, context: Context) =>
  route(async () => {
    assertOrigin(request);
    const { slug } = await context.params;
    z.uuid().parse(slug);
    await rateLimit(request, `event-write`, 60);
    const body = z
      .object({
        action: z.enum(['signup', 'exchange', 'cancel', 'claim']),
        encrypted: envelopeSchema.optional(),
        token: tokenSchema.optional(),
      })
      .parse(await readJson(request));
    const event = await getEvent(slug);
    if (event.purged_at || new Date(event.delete_at) <= new Date())
      throw new Error('EVENT_EXPIRED');
    const jar = await cookies();
    const setToken = (token: string) =>
      jar.set(participantCookie(event.id), token, {
        ...cookieOptions(),
        maxAge: 365 * 24 * 60 * 60,
      });
    if (body.action === 'exchange') {
      const token = tokenSchema.parse(body.token);
      const rows = checked(
        await db()
          .from('rsvp_registrations')
          .select('id')
          .eq('event_id', event.id)
          .eq('token_hash', hash(token)),
      );
      if (!rows[0]) throw new Error('RSVP_NOT_FOUND');
      setToken(token);
    } else if (body.action === 'signup') {
      const existing = await ownRegistration(event);
      if (existing) return json(await publicState(event));
      const encrypted = envelopeSchema.parse(body.encrypted);
      let raw: unknown;
      try {
        raw = await decrypt(encrypted, event.id);
      } catch {
        throw new Error('INVALID_ENCRYPTION');
      }
      const payload = payloadSchema.parse(raw);
      const token = tokenSchema.parse(body.token);
      if (hash(token) !== hash(payload.token)) throw new Error('FORBIDDEN');
      const seats =
        payload.details.attendance === 'no'
          ? 0
          : payload.details.attendance === 'friend'
            ? 2
            : 1;
      checked(
        await db().rpc('rsvp_signup', {
          p_event: event.id,
          p_token_hash: hash(token),
          p_encrypted: encrypted,
          p_seats: seats,
          p_has_email: !!payload.details.email,
        }),
      ) as Registration;
      setToken(token);
      scheduleMail();
    } else {
      const own = await ownRegistration(event);
      if (!own) throw new Error('RSVP_NOT_FOUND');
      checked(
        await db().rpc(
          body.action === 'cancel' ? 'rsvp_cancel' : 'rsvp_claim',
          { p_event: event.id, p_registration: own.id },
        ),
      );
      if (body.action === 'cancel') jar.delete(participantCookie(event.id));
      scheduleMail();
    }
    return json(await publicState(await getEvent(slug)));
  });
