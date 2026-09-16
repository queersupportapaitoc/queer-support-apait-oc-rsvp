import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { db, checked } from '@/lib/db';
import { eventSchema, envelopeSchema, payloadSchema } from '@/lib/validation';
import { json, route, assertOrigin, readJson } from '@/lib/http';
import { decrypt, hash } from '@/lib/secrets';
import { scheduleMail } from '@/lib/mail';
import type { Event } from '@/lib/types';
type Context = { params: Promise<{ id: string }> };
export const POST = (request: Request, context: Context) =>
  route(async () => {
    assertOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    z.uuid().parse(id);
    const body = z
      .object({
        action: z.enum([
          'update',
          'add',
          'remove',
          'claim',
          'retry-mail',
          'delete-event',
        ]),
        event: eventSchema.optional(),
        encrypted: envelopeSchema.optional(),
        registrationId: z.uuid().optional(),
      })
      .parse(await readJson(request));
    const event = checked(
      await db().from('rsvp_events').select('*').eq('id', id),
    )[0] as Event | undefined;
    if (!event) throw new Error('NOT_FOUND');
    if (body.action === 'delete-event') {
      checked(await db().from('rsvp_events').delete().eq('id', id));
      return json({ ok: true });
    }
    if (event.purged_at || new Date(event.delete_at) <= new Date())
      throw new Error('EVENT_EXPIRED');
    if (body.action === 'update') {
      const data = eventSchema.parse(body.event);
      checked(
        await db().rpc('rsvp_update_event', {
          p_event: id,
          p_title: data.title,
          p_location: data.location,
          p_starts_at: data.starts_at,
          p_delete_at: data.delete_at,
          p_capacity: data.capacity,
        }),
      );
    } else if (body.action === 'add') {
      const encrypted = envelopeSchema.parse(body.encrypted);
      let raw: unknown;
      try {
        raw = await decrypt(encrypted, id);
      } catch {
        throw new Error('INVALID_ENCRYPTION');
      }
      const payload = payloadSchema.parse(raw);
      checked(
        await db().rpc('rsvp_signup', {
          p_event: id,
          p_token_hash: hash(payload.token),
          p_encrypted: encrypted,
          p_seats:
            payload.details.attendance === 'no'
              ? 0
              : payload.details.attendance === 'friend'
                ? 2
                : 1,
          p_has_email: !!payload.details.email,
        }),
      );
    } else if (body.action === 'remove' || body.action === 'claim') {
      checked(
        await db().rpc(
          body.action === 'remove' ? 'rsvp_cancel' : 'rsvp_claim',
          { p_event: id, p_registration: z.uuid().parse(body.registrationId) },
        ),
      );
    } else {
      checked(await db().rpc('rsvp_retry_mail', { p_event: id }));
    }
    scheduleMail();
    return json({ ok: true });
  });
