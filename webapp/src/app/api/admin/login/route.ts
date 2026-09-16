import { cookies } from 'next/headers';
import { z } from 'zod';
import { db, checked } from '@/lib/db';
import { json, route, assertOrigin, readJson, rateLimit } from '@/lib/http';
import { verifyPassword, hashPassword } from '@/lib/password';
import { opaqueToken, hash, fingerprint } from '@/lib/secrets';
import { ADMIN_COOKIE, cookieOptions } from '@/lib/auth';
let dummy: Promise<string> | undefined;
export const POST = (request: Request) =>
  route(async () => {
    assertOrigin(request);
    await rateLimit(request, 'login', 10, 900);
    const { username, password } = z
      .object({
        username: z.string().trim().toLowerCase().min(1).max(80),
        password: z.string().min(1).max(256),
      })
      .parse(await readJson(request));
    if (
      !checked(
        await db().rpc('rsvp_rate_limit', {
          p_key: fingerprint(`account:${username}`),
          p_limit: 20,
          p_window: 900,
        }),
      )
    )
      throw new Error('RATE_LIMIT');
    const admin = checked(
      await db().from('rsvp_admins').select('*').eq('username', username),
    )[0];
    dummy ??= hashPassword(opaqueToken());
    const valid = await verifyPassword(
      password,
      admin?.password_hash || (await dummy),
    );
    if (!valid || !admin) throw new Error('INVALID_LOGIN');
    const token = opaqueToken(),
      expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
    checked(
      await db()
        .from('rsvp_sessions')
        .insert({
          token_hash: hash(token),
          admin_id: admin.id,
          expires_at: expires.toISOString(),
        }),
    );
    (await cookies()).set(ADMIN_COOKIE, token, { ...cookieOptions(), expires });
    return json({ ok: true });
  });
