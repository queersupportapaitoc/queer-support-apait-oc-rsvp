# Security notes

Do not report secrets or participant information in a public issue.

## Trust boundaries

The browser encrypts its validated participant payload using a fresh AES-256-GCM key and 96-bit nonce, wraps the AES key with a 3072-bit RSA-OAEP-SHA-256 public key, and binds the ciphertext to the event UUID as authenticated additional data. The server decrypts only for validation, authorized rosters, and email. The database stores the original encrypted envelope, metadata, and SHA-256 hashes of 256-bit management tokens.

The server's RSA private key, Supabase service key, and SMTP credentials must remain outside PostgreSQL and Git. The service key bypasses RLS and is deliberately restricted to server modules. All application tables have RLS enabled and no anonymous/authenticated grants. All application RPCs revoke PostgreSQL's default PUBLIC execute permission.

The app uses origin checks on JSON mutations, HTTP-only SameSite cookies, a nonce-based Content Security Policy, no-referrer policy, no-store responses for personalized data, output escaping through React, bounded input, and database-backed rate limits. Management links put their bearer token in a fragment rather than an HTTP request URL. The fragment is exchanged by POST and immediately removed from browser history. Links are bearer credentials; anyone with one can manage that RSVP.

Signup sends the newly generated management token both inside the encrypted payload and as a separate proof of possession. The server verifies both copies before setting a management cookie. This keeps a copied database envelope and token hash from being replayed to acquire control of an RSVP.

RSA private key rotation requires decrypting and re-encrypting existing envelopes or waiting until all live participant data has expired. Key rotation tooling, organizer MFA, and cryptographic erasure from provider backups are not implemented. Email addresses are not verified before sending a confirmation; rate limits reduce but do not eliminate unwanted-email abuse.

## Retention

Application access stops at `delete_at`. A minutely PostgreSQL job physically deletes participant rows and their pending email jobs. The scheduler may be delayed by database unavailability; it catches up after recovery. Backups, provider logs, delivered email, and copies an organizer makes have separate lifecycles.

Do not log request bodies, decrypted participant data, cookies, email links, or SMTP error details. The application logs only generic failure categories. Platform-level access logs may still contain public event URLs and network metadata.

## Incident response

Revoke compromised organizer sessions, rotate exposed SMTP/service credentials, and restrict the affected deployment. If the RSA private key is exposed, consider every encrypted record under that key compromised, including retained backups. Inspect the scope before reopening signup. Do not silently generate a new private key while old encrypted records remain.
