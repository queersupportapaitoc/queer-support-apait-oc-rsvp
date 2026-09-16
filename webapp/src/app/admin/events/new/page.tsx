import Link from 'next/link';
import { redirect } from 'next/navigation';
import { adminSession } from '@/lib/auth';
import EventEditor from '@/components/EventEditor';
export const dynamic = 'force-dynamic';
export default async function NewEvent() {
  if (!(await adminSession())) redirect('/admin/login');
  return (
    <div className="admin-shell narrow">
      <Link className="back-link" href="/admin">
        ← All events
      </Link>
      <section className="card">
        <span className="eyebrow">New event</span>
        <h1>Create a events</h1>
        <p>Set the event details and RSVP capacity.</p>
        <EventEditor />
      </section>
    </div>
  );
}
