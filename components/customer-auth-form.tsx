'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

function safeReturnPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/account/profile';
}

export default function CustomerAuthForm({ mode, returnTo = '/account/profile', email: initialEmail = '', token = '' }: {
  mode: Mode;
  returnTo?: string;
  email?: string;
  token?: string;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [resetToken, setResetToken] = useState(token);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const title = mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Choose a new password';

  useEffect(() => {
    if (mode !== 'reset' || token) return;
    const value = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    if (value) setResetToken(value);
  }, [mode, token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const endpoint = mode === 'login' ? '/api/customer/login'
      : mode === 'register' ? '/api/customer/register'
      : mode === 'forgot' ? '/api/customer/password-reset/request'
      : '/api/customer/password-reset/complete';
    const body = mode === 'register' ? { name, email, phone, password }
      : mode === 'login' ? { email, password }
      : mode === 'forgot' ? { email }
      : { email, token: resetToken, password };
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const responseText = await response.text();
      let data: { error?: string; message?: string } = {};
      try { data = responseText ? JSON.parse(responseText) : {}; } catch { /* Show a useful HTTP message below. */ }
      if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}). The store database may need its account migration.`);
      if (mode === 'login' || mode === 'register') {
        window.location.assign(safeReturnPath(returnTo));
        return;
      }
      setMessage(data.message || 'Done.');
      setPassword('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  return <main className="page-wrap admin-wrap customer-auth-page">
    <div className="collection-title"><span className="eyebrow">AS COLLECTION · CUSTOMER ACCOUNT</span><h1>{title}</h1>
      <p>{mode === 'register' ? 'Create an account to keep your delivery details and review your order history.' : mode === 'login' ? 'Sign in to see your saved delivery details and orders.' : mode === 'forgot' ? 'Enter your account email. If it matches an account, we will send a one-time link.' : 'Reset links expire after 60 minutes and can only be used once.'}</p>
    </div>
    <form className="admin-card customer-auth-card" onSubmit={submit}>
      {mode === 'register' && <label className="field-label">Full name<input required autoComplete="name" minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>}
      {mode !== 'reset' && <label className="field-label">Email address<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>}
      {mode === 'register' && <label className="field-label">WhatsApp number<input required type="tel" autoComplete="tel" inputMode="tel" placeholder="+92 3XX XXXXXXX" minLength={7} maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} /><small>Include your country code so the store can contact you about your account or order.</small></label>}
      {(mode === 'login' || mode === 'register' || mode === 'reset') && <div className="customer-password-field">
        <label className="field-label" htmlFor="customer-auth-password">{mode === 'reset' ? 'New password' : 'Password'}</label>
        <div className="customer-password-control">
          <input id="customer-auth-password" required type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'reset' || mode === 'register' ? 10 : 1} maxLength={200} value={password} onChange={event => setPassword(event.target.value)} />
          <button type="button" className="customer-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
        </div>
        {(mode === 'register' || mode === 'reset') && <small>At least 10 characters. Avoid sharing this password with anyone.</small>}
      </div>}
      {error && <p className="error-note" role="alert">{error}</p>}
      {message && <p className="success-note" role="status">{message}</p>}
      {mode !== 'reset' || resetToken ? <button className="button dark wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Save new password'}</button> : <p className="error-note">This reset link is missing or invalid. Request a new one.</p>}
      {mode === 'login' && <p className="customer-auth-links"><Link href="/account/forgot-password">Forgot password?</Link><span>New here? <Link href={`/account/register?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`}>Create an account</Link></span></p>}
      {mode === 'register' && <p className="small-note">Your password is stored as a secure hash. See our <Link href="/policies/privacy">Privacy policy</Link>.</p>}
      {mode === 'forgot' && <p className="customer-auth-links"><Link href="/account/login">Back to sign in</Link></p>}
      {mode === 'reset' && message && <p className="customer-auth-links"><Link href="/account/login">Go to sign in</Link></p>}
    </form>
  </main>;
}
