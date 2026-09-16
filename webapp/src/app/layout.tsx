import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'Queer Support · APAIT', template: '%s · Queer Support' },
  description: 'RSVP for Queer Support at APAIT in Garden Grove.',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              q<span>✳</span>
            </span>
            <span>
              Queer Support<small>AT APAIT · ORANGE COUNTY</small>
            </span>
          </Link>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <span>
            Queer Support <span aria-hidden="true">♡</span> APAIT
          </span>
          <span>12832 Garden Grove Blvd., Suite E, Garden Grove, CA 92843</span>
          <Link href="/admin">Organizer sign in</Link>
        </footer>
      </body>
    </html>
  );
}
