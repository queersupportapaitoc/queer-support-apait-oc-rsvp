import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { db, checked } from '@/lib/db';
import { assertOrigin, json, rateLimit, readJson, route } from '@/lib/http';
import { hashPassword, verifyPassword } from '@/lib/password';
import { usernameSchema } from '@/lib/validation';

export const POST = (request: Request) =>
  route(async () => {
    assertOrigin(request);
    const session = await requireAdmin();
    await rateLimit(request, `account:${session.admin_id}`, 10, 900);
    const body = z
      .object({
        username: usernameSchema,
        currentPassword: z.string().min(1).max(256),
        newPassword: z.union([z.literal(''), z.string().min(14).max(256)]),
      })
      .parse(await readJson(request));
    const admin = checked(
      await db()
        .from('rsvp_admins')
        .select('password_hash')
        .eq('id', session.admin_id),
    )[0];
    if (
      !admin ||
      !(await verifyPassword(body.currentPassword, admin.password_hash))
    )
      throw new Error('CURRENT_PASSWORD');
    const update: { username: string; password_hash?: string } = {
      username: body.username,
    };
    if (body.newPassword)
      update.password_hash = await hashPassword(body.newPassword);
    try {
      checked(
        await db()
          .from('rsvp_admins')
          .update(update)
          .eq('id', session.admin_id),
      );
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      )
        throw new Error('USERNAME_TAKEN');
      throw error;
    }
    if (body.newPassword)
      checked(
        await db()
          .from('rsvp_sessions')
          .delete()
          .eq('admin_id', session.admin_id)
          .neq('token_hash', session.token_hash),
      );
    return json({ ok: true, username: body.username });
  });
