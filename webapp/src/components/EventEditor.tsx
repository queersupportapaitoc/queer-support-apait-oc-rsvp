'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import {
  defaultDeletion,
  localToInstant,
  nextThursday,
  toLocalInput,
} from '@/lib/time';
import type { Event } from '@/lib/types';
export default function EventEditor({ event }: { event?: Event }) {
  const router = useRouter();
  const [start, setStart] = useState(
    event ? toLocalInput(event.starts_at) : nextThursday(),
  );
  const [deletion, setDeletion] = useState(
    event ? toLocalInput(event.delete_at) : defaultDeletion(start),
  );
  const [customDeletion, setCustomDeletion] = useState(!!event);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const form = new FormData(e.currentTarget);
      const data = {
        title: String(form.get('title')),
        location: String(form.get('location')),
        capacity: Number(form.get('capacity')),
        starts_at: localToInstant(start),
        delete_at: localToInstant(deletion),
      };
      if (event) {
        await api(`/api/admin/events/${event.id}`, {
          action: 'update',
          event: data,
        });
        setSaved(true);
        router.refresh();
      } else {
        const created = await api<Event>('/api/admin/events', data);
        router.push(`/admin/events/${created.id}`);
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="event-editor">
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="alert success">
          Event updated.
        </p>
      )}
      <fieldset disabled={busy} className="form-fields">
        <label className="field">
          <span>Event name</span>
          <input
            name="title"
            defaultValue={event?.title || 'Queer Support'}
            required
            maxLength={120}
          />
        </label>
        <label className="field">
          <span>Location</span>
          <input
            name="location"
            defaultValue={
              event?.location ||
              'APAIT · 12832 Garden Grove Blvd., Suite E, Garden Grove, CA 92843'
            }
            required
            maxLength={300}
          />
        </label>
        <div className="two-columns">
          <label className="field">
            <span>Date & time · Pacific</span>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (!customDeletion && e.target.value)
                  setDeletion(defaultDeletion(e.target.value));
              }}
              required
            />
          </label>
          <label className="field">
            <span>Maximum people</span>
            <input
              name="capacity"
              type="number"
              min={1}
              max={500}
              defaultValue={event?.capacity || 15}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Delete participant information · Pacific</span>
          <input
            type="datetime-local"
            value={deletion}
            onChange={(e) => {
              setCustomDeletion(true);
              setDeletion(e.target.value);
            }}
            required
          />
        </label>
        <p className="help">
          Defaults to midnight after the event. This removes answers, contact
          information, management links, and pending emails from the live
          database. The empty event remains in your dashboard.
        </p>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setCustomDeletion(false);
            setDeletion(defaultDeletion(start));
          }}
        >
          Use midnight after the event
        </button>
        {event && (
          <p className="note">
            Confirmed RSVPs stay confirmed if you lower capacity. Increasing
            capacity notifies eligible waitlisted guests. Changing the event
            name, location, or time sends an update to guests with email.
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : event ? 'Save changes' : 'Create event'}{' '}
          <span aria-hidden="true">↗</span>
        </button>
      </fieldset>
    </form>
  );
}
