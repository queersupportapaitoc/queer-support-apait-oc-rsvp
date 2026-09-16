import { requireAdmin } from '@/lib/auth';
import { db, checked } from '@/lib/db';
import { eventSchema } from '@/lib/validation';
import { json, route, assertOrigin, readJson } from '@/lib/http';
export const POST = (request: Request) =>
  route(async () => {
    assertOrigin(request);
    await requireAdmin();
    const event = eventSchema.parse(await readJson(request));
    if (new Date(event.starts_at) <= new Date())
      throw new Error('EVENT_CLOSED');
    return json(
      checked(
        await db().from('rsvp_events').insert(event).select('*').single(),
      ),
      201,
    );
  });
