'use client';
import { useState } from 'react';
import type { Details } from '@/lib/types';
export function readDetails(form: HTMLFormElement): Details {
  const data = new FormData(form);
  return {
    name: String(data.get('name') || '').trim(),
    attendance: String(data.get('attendance')) as Details['attendance'],
    friend: String(data.get('friend') || '').trim(),
    comments: String(data.get('comments') || '').trim(),
    pronouns: String(data.get('pronouns') || '').trim(),
    email: String(data.get('email') || '').trim(),
  };
}
export default function ParticipantFields({
  available,
  admin = false,
}: {
  available: number;
  admin?: boolean;
}) {
  const [attendance, setAttendance] = useState('yes');
  const likelyWaitlist =
    attendance !== 'no' && available < (attendance === 'friend' ? 2 : 1);
  return (
    <>
      <label className="field">
        <span>
          1. Your name <span className="required">*</span>
        </span>
        <input
          name="name"
          required
          maxLength={160}
          autoComplete="name"
          placeholder="Enter your answer"
        />
      </label>
      <label className="field">
        <span>Your pronouns</span>
        <input
          name="pronouns"
          maxLength={100}
          placeholder="e.g. they/them"
          autoComplete="off"
        />
      </label>
      <fieldset className="field choices">
        <legend>
          2. Will you be joining us this evening?{' '}
          <span className="required">*</span>
        </legend>
        {[
          ['yes', "Yep! I'll be there."],
          ['no', "No, Can't make it."],
          ['friend', "Yes, and I'm bringing a friend!"],
        ].map(([value, label]) => (
          <label className="choice" key={value}>
            <input
              type="radio"
              name="attendance"
              value={value}
              required
              onChange={() => setAttendance(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {attendance === 'friend' && (
        <p className="note">
          You and your friend count as two people. Your RSVP stays together, so
          you’ll need two available spots.
        </p>
      )}
      <label className="field">
        <span>
          3. If you are bringing a friend, what is their name/pronouns?
        </span>
        <input name="friend" maxLength={300} placeholder="Enter your answer" />
      </label>
      <label className="field">
        <span>4. Questions? Comments? Concerns?</span>
        <textarea
          name="comments"
          maxLength={3000}
          rows={3}
          placeholder="Enter your answer"
        />
      </label>
      <div className="divider" />
      <label className="field">
        <span>
          Your email address <span className="optional">Optional</span>
        </span>
        <input
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          aria-describedby="email-help"
        />
      </label>
      <p id="email-help" className="help">
        {admin
          ? 'An email lets this participant receive updates and manage their own RSVP. Without email, staff will need to manage this manually added RSVP.'
          : likelyWaitlist
            ? 'An email address is not required. If you provide one, we’ll notify you when a spot opens up. Otherwise, return here on the same device and browser you signed up with to claim a spot or leave the waitlist.'
            : 'An email address is not required, but lets you more easily manage your RSVP using a private email link. Without email, return here on the same device and browser to manage or remove your RSVP.'}
      </p>
    </>
  );
}
