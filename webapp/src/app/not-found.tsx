import Link from 'next/link';
export default function NotFound() {
  return (
    <section className="card login-card">
      <span className="eyebrow">Page not found</span>
      <h1>We couldn’t find that page.</h1>
      <p>Check the event link shared by your organizer.</p>
      <Link className="button" href="/">
        Back to Queer Support
      </Link>
    </section>
  );
}
