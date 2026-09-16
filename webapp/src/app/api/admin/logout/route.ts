import { cookies } from 'next/headers';
import { ADMIN_COOKIE } from '@/lib/auth';
import { db, checked } from '@/lib/db';
import { hash } from '@/lib/secrets';
import { json, route, assertOrigin } from '@/lib/http';
export const POST = (request: Request) =>
  route(async () => {
    assertOrigin(request);
    const jar = await cookies();
    const token = jar.get(ADMIN_COOKIE)?.value;
    if (token)
      checked(
        await db().from('rsvp_sessions').delete().eq('token_hash', hash(token)),
      );
    jar.delete(ADMIN_COOKIE);
    return json({ ok: true });
  });
