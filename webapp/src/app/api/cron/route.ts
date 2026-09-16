import { timingSafeEqual } from 'node:crypto';
import { json, route } from '@/lib/http';
import { required } from '@/lib/secrets';
import { processMail } from '@/lib/mail';
import { db, checked } from '@/lib/db';
export const maxDuration = 60;
export const GET = (request: Request) =>
  route(async () => {
    const expected = Buffer.from(`Bearer ${required('CRON_SECRET')}`),
      actual = Buffer.from(request.headers.get('authorization') || '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return json({ error: 'Unauthorized' }, 401);
    const purged = checked(await db().rpc('rsvp_purge_expired'));
    return json({ purged, ...(await processMail()) });
  });
