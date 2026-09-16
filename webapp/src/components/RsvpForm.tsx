'use client';
import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { api } from '@/lib/client';
import { encrypt, randomToken } from '@/lib/crypto';
import { eventTime } from '@/lib/time';
import type { PublicState } from '@/lib/types';
import ParticipantFields, { readDetails } from './ParticipantFields';
export default function RsvpForm({ initial }: { initial: PublicState }) {
  const [state, setState] = useState(initial),
    [busy, setBusy] = useState(false),
    [checkingAvailability, setCheckingAvailability] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [confirmCancel, setConfirmCancel] = useState(false),
    [recovering, setRecovering] = useState(true);
  const endpoint = `/api/events/${initial.event.slug}`;
  const refresh = useCallback(async () => {
    setState(await api<PublicState>(endpoint));
  }, [endpoint]);
  useEffect(() => {
    let active = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('manage');
    // Keep secrets out of browser history and subsequent URL copies.
    if (token) window.history.replaceState(null, '', window.location.pathname);
    (async () => {
      try {
        if (token) {
          const next = await api<PublicState>(endpoint, {
            action: 'exchange',
            token,
          });
          if (active) setState(next);
        } else await refresh();
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setRecovering(false);
      }
    })();
    const poll = () => {
      if (document.visibilityState === 'visible') refresh().catch(() => {});
    };
    const interval = setInterval(poll, 30000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [endpoint, refresh]);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const details = readDetails(form);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { key } = await api<{ key: JsonWebKey }>('/api/key');
      const storageKey = `qs_pending_${state.event.id}`;
      let token: string | null = null;
      try {
        token = sessionStorage.getItem(storageKey);
      } catch {}
      token ||= randomToken();
      try {
        sessionStorage.setItem(storageKey, token);
      } catch {}
      const encrypted = await encrypt(key, { details, token }, state.event.id);
      setState(
        await api<PublicState>(endpoint, {
          action: 'signup',
          encrypted,
          token,
        }),
      );
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: 'cancel' | 'claim') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setState(await api<PublicState>(endpoint, { action }));
      setConfirmCancel(false);
      if (action === 'cancel') setNotice('Your response has been removed.');
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function checkAvailability() {
    setBusy(true);
    setCheckingAvailability(true);
    setError('');
    setNotice('');
    try {
      const next = await api<PublicState>(endpoint);
      setState(next);
      const registration = next.registration;
      setNotice(
        next.expired || next.closed
          ? 'Availability checked. Claims for this event are closed.'
          : registration?.status === 'waitlisted'
            ? next.available >= registration.seats
              ? `Availability checked. ${registration.seats === 2 ? 'Two spots are available! Click “Claim two spots”' : 'A spot is available! Click “Claim my spot”'} below to confirm your RSVP.`
              : `Availability checked. ${registration.seats === 2 ? 'There aren’t two spots available together yet.' : 'No spots are available yet.'} You’re still on the waitlist.`
            : 'Availability checked. Your RSVP is up to date.',
      );
    } catch (e) {
      setError(`Couldn’t check availability. ${(e as Error).message}`);
    } finally {
      setCheckingAvailability(false);
      setBusy(false);
    }
  }
  const own = state.registration;
  const canClaim =
    own?.status === 'waitlisted' &&
    !state.closed &&
    !state.expired &&
    state.available >= own.seats;
  return (
    <div className="event-layout">
      <aside className="event-story">
        <div className="banner-wrap">
          <Image
            src="/images/queer-support-banner.png"
            alt="Queer Support at APAIT, with a group gathered beneath a rainbow flag"
            width={2000}
            height={1000}
            priority
          />
        </div>
        <div className="story-content">
          <h1>{state.event.title}</h1>
          <div className="event-facts">
            <div>
              <span aria-hidden="true">◷</span>
              <p>
                <strong>Date and time</strong>
                {eventTime(state.event.starts_at)}
              </p>
            </div>
            <div>
              <span aria-hidden="true">⌖</span>
              <p>
                <strong>Location</strong>
                {state.event.location}
              </p>
            </div>
          </div>
        </div>
      </aside>
      <section className="card form-card" aria-label="RSVP">
        <div className="section-heading">
          <h2>
            {canClaim
              ? own.seats === 2
                ? 'Claim your spots'
                : 'Claim your spot'
              : 'RSVP Form'}
          </h2>
        </div>
        {!canClaim && (
          <p className="intro">
            Thanks for filling out the RSVP form! For security reasons, we lock
            the front door after everyone who has filled this form arrives.
          </p>
        )}
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="alert success">
            {notice}
          </p>
        )}
        {recovering ? (
          <p role="status">Checking your RSVP…</p>
        ) : state.expired ? (
          <div className="status-panel">
            <h3>This event has ended.</h3>
            <p>
              Participant information is no longer available. Please ask the
              organizer for the next event’s link.
            </p>
          </div>
        ) : own ? (
          <div className="status-panel" aria-live="polite">
            <span className={`pill ${own.status}`}>
              {own.status === 'confirmed'
                ? 'You’re on the list'
                : own.status === 'waitlisted'
                  ? 'On the waitlist'
                  : 'Response received'}
            </span>
            <h3>
              {own.status === 'confirmed'
                ? own.seats === 2
                  ? 'Two spots confirmed.'
                  : 'Your spot is confirmed.'
                : own.status === 'waitlisted'
                  ? canClaim
                    ? own.seats === 2
                      ? 'Two spots are available!'
                      : 'A spot is available!'
                    : 'Your RSVP is waitlisted.'
                  : 'Thanks for letting us know.'}
            </h3>
            <p>
              {own.status === 'confirmed'
                ? `Your ${own.seats === 2 ? 'two spots are' : 'spot is'} confirmed for ${eventTime(state.event.starts_at)}.`
                : own.status === 'waitlisted'
                  ? canClaim
                    ? `Click “Claim ${own.seats === 2 ? 'two spots' : 'my spot'}” below to confirm ${own.seats === 2 ? 'your RSVP for you and your friend' : 'your RSVP'}. ${own.seats === 2 ? 'Your spots aren’t' : 'Your spot isn’t'} reserved until you claim ${own.seats === 2 ? 'them' : 'it'}.`
                    : `You’re waiting for ${own.seats === 2 ? 'two spots together' : 'one spot'}. Openings are first come, first served; claim ${own.seats === 2 ? 'your spots' : 'your spot'} here when available.`
                  : 'No spot has been reserved. You can remove this response and sign up again if your plans change.'}
            </p>
            {own.status === 'waitlisted' && (
              <>
                <p className="note">
                  {canClaim
                    ? 'Openings are first come, first served.'
                    : own.hasEmail
                      ? 'We’ll email when there’s room for your party. You can also check here.'
                      : 'Return to this page on this same device and browser to check for an opening.'}
                </p>
                {!state.closed && (
                  <button
                    disabled={busy || state.available < own.seats}
                    onClick={() => act('claim')}
                  >
                    {state.available >= own.seats
                      ? `Claim ${own.seats === 2 ? 'two spots' : 'my spot'}`
                      : 'No spots available yet'}
                  </button>
                )}
                {state.closed && (
                  <p>Seat claims closed when the event started.</p>
                )}
                <button
                  className="text-button"
                  disabled={busy}
                  aria-busy={checkingAvailability}
                  onClick={checkAvailability}
                >
                  {checkingAvailability ? 'Checking…' : 'Check availability'}
                </button>
              </>
            )}
            {own.hasEmail && !canClaim && (
              <p className="help">
                Your email includes a private management link. Delivery can take
                a few minutes; check your spam folder too.
              </p>
            )}
            {confirmCancel ? (
              <div className="cancel-confirm">
                <p>
                  Remove your{' '}
                  {own.status === 'waitlisted' ? 'waitlist entry' : 'response'}?{' '}
                  {own.status === 'confirmed'
                    ? 'Your spots will be released.'
                    : ''}
                </p>
                <div className="button-row">
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => act('cancel')}
                  >
                    Yes, remove it
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirmCancel(false)}
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-button danger-text"
                disabled={busy}
                onClick={() => setConfirmCancel(true)}
              >
                {own.status === 'waitlisted'
                  ? 'Leave the waitlist'
                  : 'Remove my RSVP'}
              </button>
            )}
          </div>
        ) : state.closed ? (
          <div className="status-panel">
            <h3>Signups have closed.</h3>
            <p>
              This event has already started. If you have an RSVP, open your
              email link or return using the browser you signed up with.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="availability">
              <span className="dot" />
              {state.available === 0
                ? 'This event is full. You’re welcome to join the waitlist.'
                : state.waitlisted > 0
                  ? `${state.available} ${state.available === 1 ? 'spot is' : 'spots are'} available now. Openings are first come, first served.`
                  : `${state.available} ${state.available === 1 ? 'spot' : 'spots'} available`}
            </div>
            <p className="help required-note">
              Fields marked <span className="required">*</span> are required.
            </p>
            <fieldset disabled={busy} className="form-fields">
              <ParticipantFields available={state.available} />
            </fieldset>
            <button className="submit-button" type="submit" disabled={busy}>
              {busy ? 'Saving your encrypted RSVP…' : 'Submit'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
        )}
        <div className="privacy">
          <span aria-hidden="true">◇</span>
          <p>
            Your answers are encrypted before they leave this browser and remain
            encrypted in our database. Authorized organizers can read them.
            Participant records are scheduled for deletion at{' '}
            {eventTime(state.event.delete_at)}.{' '}
            <a
              href="https://supabase.com/docs/guides/platform/backups"
              target="_blank"
              rel="noreferrer"
            >
              Supabase backups
            </a>{' '}
            and delivered emails follow separate retention policies.
          </p>
        </div>
      </section>
    </div>
  );
}
