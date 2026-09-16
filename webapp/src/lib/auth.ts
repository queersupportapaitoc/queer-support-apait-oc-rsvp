import 'server-only';
import { cookies } from 'next/headers';
import { db, checked } from './db';
import { hash, appUrl } from './secrets';
import { tokenSchema } from './validation';
export const ADMIN_COOKIE = 'qs_admin';
export function participantCookie(id: string) {
  return `qs_${id}`;
}
export const cookieOptions = () => ({
  httpOnly: true,
  secure: appUrl().startsWith('https://'),
  sameSite: 'lax' as const,
  path: '/',
});
export async function adminSession() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || !tokenSchema.safeParse(token).success) return null;
  const session = checked(
    await db()
      .from('rsvp_sessions')
      .select('admin_id')
      .eq('token_hash', hash(token))
      .gt('expires_at', new Date().toISOString()),
  );
  return session[0] ?? null;
}
export async function requireAdmin() {
  const session = await adminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}
export async function participantHash(eventId: string): Promise<string | null> {
  const token = (await cookies()).get(participantCookie(eventId))?.value;
  return token && tokenSchema.safeParse(token).success ? hash(token) : null;
}
