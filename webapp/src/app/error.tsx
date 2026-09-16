'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card login-card">
      <h1>We couldn’t load this page.</h1>
      <p>Please try again in a moment.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
