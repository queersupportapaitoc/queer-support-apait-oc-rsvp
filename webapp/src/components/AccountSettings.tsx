'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export default function AccountSettings({ username }: { username: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState('');
  return (
    <form
      onSubmit={async (event: React.SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const newPassword = String(data.get('newPassword') || '');
        if (newPassword !== String(data.get('confirmPassword') || '')) {
          setError('New passwords do not match.');
          setSaved('');
          return;
        }
        setBusy(true);
        setError('');
        setSaved('');
        try {
          const result = await api<{ username: string }>('/api/admin/account', {
            username: data.get('username'),
            currentPassword: data.get('currentPassword'),
            newPassword,
          });
          setSaved(`Organizer credentials updated for ${result.username}.`);
          form.reset();
          const usernameInput = form.elements.namedItem(
            'username',
          ) as HTMLInputElement;
          usernameInput.value = result.username;
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      className="form-fields"
    >
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="alert success">
          {saved}
        </p>
      )}
      <label className="field">
        <span>Username</span>
        <input
          name="username"
          defaultValue={username}
          minLength={3}
          maxLength={80}
          pattern="[A-Za-z0-9_.-]+"
          autoCapitalize="none"
          autoComplete="username"
          required
        />
      </label>
      <label className="field">
        <span>Current password</span>
        <input
          name="currentPassword"
          type="password"
          maxLength={256}
          autoComplete="current-password"
          required
        />
      </label>
      <label className="field">
        <span>New password</span>
        <input
          name="newPassword"
          type="password"
          minLength={14}
          maxLength={256}
          autoComplete="new-password"
        />
        <small>
          Leave blank to keep the current password. Minimum 14 characters.
        </small>
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input
          name="confirmPassword"
          type="password"
          minLength={14}
          maxLength={256}
          autoComplete="new-password"
        />
      </label>
      <button disabled={busy}>
        {busy ? 'Updating…' : 'Update credentials'}
      </button>
    </form>
  );
}
