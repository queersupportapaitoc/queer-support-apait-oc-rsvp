'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
export default function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const form = new FormData(e.currentTarget);
        try {
          await api('/api/admin/login', {
            username: form.get('username'),
            password: form.get('password'),
          });
          router.push('/admin');
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
      <label className="field">
        <span>Username</span>
        <input
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          maxLength={80}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          maxLength={256}
        />
      </label>
      <button className="submit-button" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
        <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
}
