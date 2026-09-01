'use client';

import { FormEvent, useState } from 'react';

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export default function UnlockPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (response.ok) {
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.assign(safeNext(next));
        return;
      }
      setError(response.status === 429 ? 'Too many attempts. Try again in a minute.' : response.status === 503 ? 'Password protection is temporarily unavailable.' : 'That password doesn’t match.');
    } catch {
      setError('Could not unlock the calendar. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="unlock-shell"><section className="unlock-card"><div className="unlock-logo-frame"><img src="/lab-logo.png" alt="Printed Bioelectronics Lab" className="unlock-logo" /></div><p className="eyebrow">Equipment booking</p><h1>Laboratory of Printed Bioelectronics</h1><p className="unlock-copy">Enter the passphrase to continue.</p><form className="unlock-form" onSubmit={unlock}><label htmlFor="lab-password">Passphrase</label><input id="lab-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required /><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock Calendar'}</button>{error && <p className="form-error" role="alert">{error}</p>}</form></section></main>;
}
