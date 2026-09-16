'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { encrypt, randomToken } from '@/lib/crypto';
import ParticipantFields, { readDetails } from './ParticipantFields';
export function Logout() {
  const router = useRouter();
  const [error, setError] = useState('');
  return (
    <>
      <button
        className="text-button"
        onClick={async () => {
          try {
            await api('/api/admin/logout', {});
            router.push('/admin/login');
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Sign out
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="share-link">
      <input
        aria-label="Shareable RSVP link"
        value={url}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <button
        className="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}
export function RemoveRegistration({
  eventId,
  id,
  name,
}: {
  eventId: string;
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <button
        className="text-button danger-text"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              `Remove ${name}’s response? Any confirmed seats will be released.`,
            )
          )
            return;
          setBusy(true);
          try {
            await api(`/api/admin/events/${eventId}`, {
              action: 'remove',
              registrationId: id,
            });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Remove
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
export function AddParticipant({
  eventId,
  available,
}: {
  eventId: string;
  available: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [token, setToken] = useState(() => randomToken());
  return (
    <form
      onSubmit={async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const details = readDetails(form);
        setBusy(true);
        setError('');
        setSaved(false);
        try {
          const { key } = await api<{ key: JsonWebKey }>('/api/key');
          const encrypted = await encrypt(key, { details, token }, eventId);
          await api(`/api/admin/events/${eventId}`, {
            action: 'add',
            encrypted,
          });
          setSaved(true);
          setToken(randomToken());
          form.reset();
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="alert success">
          Response added. Check the roster for confirmed or waitlisted status.
        </p>
      )}
      <fieldset disabled={busy} className="form-fields">
        <ParticipantFields available={available} admin />
        <button disabled={busy}>{busy ? 'Adding…' : 'Add response'}</button>
      </fieldset>
    </form>
  );
}
export function RetryMail({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  return (
    <>
      <button
        className="secondary"
        onClick={async () => {
          try {
            await api(`/api/admin/events/${eventId}`, { action: 'retry-mail' });
            setMessage('Delivery retry scheduled.');
            router.refresh();
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Retry failed emails
      </button>
      {message && <p role="status">{message}</p>}
    </>
  );
}
export function ConfirmRegistration({
  eventId,
  id,
  seats,
  available,
}: {
  eventId: string;
  id: string;
  seats: number;
  available: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <button
        className="text-button"
        disabled={busy || available < seats}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/admin/events/${eventId}`, {
              action: 'claim',
              registrationId: id,
            });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Claim {seats === 2 ? 'two spots' : 'spot'}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
