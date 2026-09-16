# Queer Support RSVP · APAIT Orange County

A private-by-default RSVP app built with Next.js App Router and Supabase PostgreSQL, ready for Vercel. The public form preserves the original questions and banner, with optional pronouns and email.

## What it does

- An organizer dashboard with username/password authentication, multiple events, editable capacity (default 15), editable Pacific event/deletion times, shareable links, participant rosters, manual additions, removals, and waitlist claims.
- Browser-side AES-256-GCM encryption with RSA-OAEP-SHA-256 key wrapping. The server validates encrypted submissions and stores their encrypted envelopes. Names, answers, pronouns, email addresses, and management tokens are never stored as plaintext in PostgreSQL.
- Atomic seat allocation in PostgreSQL. Bringing a friend counts as two people; a pair stays together. Declining consumes no seats. Lowering capacity preserves confirmed reservations.
- Waitlist openings are first to claim, not automatic promotions or reservations. Eligible waitlisted people with email are notified, while any new signup or waitlisted claim can take an available opening first.
- Secure same-browser cookies and private email links for managing RSVPs. Email links use URL fragments, exchange for an HTTP-only cookie, and clear the fragment. Opening a link never cancels an RSVP.
- Confirmation, waitlist, vacancy, and event-update emails via Gmail SMTP. A database outbox retries failed deliveries. The roster shows pending/failed mail and provides a retry action.
- Retention enforced at the configured deadline, defaulting to midnight **after** the event in `America/Los_Angeles`. PostgreSQL cron purges expired records every minute, including their mail jobs. Public and admin reads deny access at the deadline even before the purge runs.

## Local setup

Use Node.js 22 or newer and a Supabase project.

```sh
npm ci
cp .env.example .env
# Fill the Supabase and Gmail settings in .env.
npm run setup:keys
npm run db:migrate
npm run admin:create -- admin
npm run dev
```

If this project has already been provisioned, keep the existing ignored `.env`: it contains the private key needed to decrypt existing records. **Do not regenerate it.**

Open `http://localhost:3000/admin`. Generated organizer credentials are saved to `.local/admin-admin.txt` (ignored by Git, mode 0600). Pass another username to create another organizer. For a chosen password, set `ADMIN_PASSWORD` securely in your local environment before running the command; never put passwords in command arguments or commits.

Root `.env` is loaded locally. No credential uses a `NEXT_PUBLIC_` prefix. `MAIL_DISABLED=true` leaves emails queued without transmitting them and is the default for local work. Do not use production participant data in development.

The first dashboard is empty; create an event to get its shareable `/e/<uuid>` link. All event times shown or entered are Pacific time; daylight saving changes are handled explicitly.

## Deploy to Vercel

1. Create a Vercel project using this repository (or deploy from the local checkout with the Vercel CLI). Set **Root Directory** to `webapp`, framework to **Next.js**, and Node.js to **22.x** or newer. Allow the project to include files outside the root directory so the workspace lockfile is available. No GitHub push is required for a CLI deployment.
2. Add these server-side environment variables in Vercel: `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RSVP_PRIVATE_KEY`, `RATE_LIMIT_SECRET`, `CRON_SECRET`, `GMAIL_ACCOUNT`, `GMAIL_APP_PASSWORD`, and `MAIL_DISABLED`.
3. Set `APP_URL` to the exact canonical HTTPS origin (no path); links and CSRF validation use it. Redirect alternate hostnames to that origin. Set `MAIL_DISABLED=false` for production. Deploy after setting the variables.
4. Update the local `APP_URL` to that same origin and run `npm run cron:configure` using your Supabase management token. This installs a Supabase cron job that calls `/api/cron` every minute for delivery retries; its bearer token lives in Supabase Vault. Keep the worker endpoint reachable through Vercel deployment protection, using a public production deployment. Verify successful responses in Supabase Cron/pg_net.
5. Sign in, create an event, and verify a signup with an email address you control before sharing the form.

Retention runs entirely in Supabase and is already installed by migrations. Email work also runs after signup/cancellation/edit requests; the cron worker provides retry recovery. No Vercel paid cron schedule is required. The temporary Supabase management PAT is only needed for provisioning/migrations; **do not deploy it or the database password to Vercel**.

For preview deployments, use an isolated Supabase project, separate keys, `MAIL_DISABLED=true`, and that preview's origin. Do not point previews at the production participant database.

## Verification

```sh
npm run test                  # crypto, validation, passwords, and timezone behavior
npm run check                 # TypeScript
npm run build                 # production build
npm run test:integration       # live Supabase concurrency, retention, and access tests
npm run start                 # serve production build; leave running for the next command
npm run test:browser           # Puppeteer / Chrome application tests
```

Integration and browser tests require the ignored root `.env` and `MAIL_DISABLED=true`. They create synthetic events and delete them afterward. Run them against a development project without participants; the retention test invokes the real purge function. Browser tests default to macOS Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; set `CHROME_PATH` elsewhere. Screenshots are saved to ignored `.local/screenshots/`.

## Operations and privacy

- The private key must be backed up separately from PostgreSQL. Losing it makes existing participant answers unreadable. Replacing it without migrating encrypted records breaks decryption. There is one active key; automatic key rotation is not implemented.
- Database encryption protects against a database-only disclosure, not a compromised application server or authorized organizer. Browser encryption does not protect against malicious application JavaScript or a compromised device.
- Public event metadata, RSVP status, party size, timestamps, and whether an email was provided remain plaintext. Only the server can query application tables or call their RPCs; anonymous and authenticated Supabase clients have no grants or policies permitting access.
- Deletion removes live rows and invalidates management tokens. It does not erase historical database backups or mail already accepted by Gmail. SMTP providers handle recipient addresses and email content in plaintext. Review provider retention when writing any public privacy policy.
- Participant cookies contain random bearer tokens. They last up to a year to tolerate changes to the event deletion date, but grant access only while the corresponding live record exists. Expired cookies are removed when returning to an expired event. Clearing cookies or switching browsers requires an email link; manual RSVPs without email must be managed by organizers.
- The app does not publish a searchable event list or any public roster. It has no analytics or third-party frontend assets. A shared link is not an attendance eligibility check.
- Organizer passwords are salted with scrypt. Sessions use hashed random tokens, expire after eight hours, and are invalidated on logout. Public writes and sign-in have shared database rate limits. Vercel's trusted forwarding header is used for IP bucketing; raw IPs are not stored.
- Email delivery is at-least-once, with leases, exponential backoff, and eight automatic attempts. A crash after SMTP acceptance can cause a duplicate; a stable Message-ID helps identify retries. The admin dashboard exposes exhausted jobs for manual retry. Cancellation and expiry cascade-delete queued mail.
- Event signup and seat claims close at the scheduled start. Existing guests can still remove their response until deletion.
- Cancellation removes the participant record immediately. Removed responses are not retained as an audit history.

See [the captured original form](docs/reference/original-form.md), [database migrations](database/migrations), and [security notes](SECURITY.md).
