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
  const [attendance, setAttendance] = useState('');
  const likelyWaitlist =
    attendance !== 'no' && available < (attendance === 'friend' ? 2 : 1);
  return (
    <>
      <div className="participant-details">
        <label className="field">
          <span>
            Your name <span className="required">*</span>
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
      </div>
      <fieldset className="field choices">
        <legend>
          Will you be joining us this week? <span className="required">*</span>
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
      {(attendance === 'yes' || attendance === 'friend') && (
        <label className="choice">
          <input type="checkbox" name="acknowledgement" required />
          By submitting this form, I am reserving{' '}
          {attendance === 'friend' ? 2 : 1} of the remaining seats. If my plans
          change and I can no longer make it, I will remove my RSVP or let Rene
          know as soon as I can. <span className="required">*</span>
        </label>
      )}
      {attendance === 'friend' && (
        <label className="field">
          <span>What is your friend&apos;s name/pronouns?</span>
          <input
            name="friend"
            maxLength={300}
            placeholder="Enter your answer"
          />
        </label>
      )}
      <label className="field">
        <span>Questions? Comments? Concerns?</span>
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
