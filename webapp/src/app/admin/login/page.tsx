import { redirect } from 'next/navigation';
import { adminSession } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';
export const dynamic = 'force-dynamic';
export default async function Login() {
  if (await adminSession()) redirect('/admin');
  return (
    <section className="card login-card">
      <span className="eyebrow">Organizer access</span>
      <h1>Organizer sign in</h1>
      <p>Sign in to manage events and RSVPs.</p>
      <LoginForm />
    </section>
  );
}
