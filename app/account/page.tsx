'use client';

import { useState } from 'react';
import Link from 'next/link';
import { money } from '@/lib/money';

export default function Account() {
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function find(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const response = await fetch(`/api/orders/lookup?number=${encodeURIComponent(number)}&email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (!response.ok) setError(data.error);
    else setResult(data);
  }

  return <main className="page-wrap admin-wrap">
    <div className="collection-title"><span className="eyebrow">YOUR ACCOUNT</span><h1>Welcome to AS Collection</h1><p>Create an account or sign in before checkout. You can also look up an existing order with its reference and checkout email.</p></div>
    <section className="admin-card customer-account-actions">
      <h2>Customer account</h2>
      <p>Create an account to keep your delivery details and see your order history.</p>
      <Link className="button dark" href="/account/login?returnTo=%2Faccount%2Fprofile">Sign in</Link>{' '}
      <Link className="button" href="/account/register?returnTo=%2Faccount%2Fprofile">Create account</Link>
      <p className="small-note">Forgot your password? You can request a reset link from the sign-in page.</p>
    </section>
    <section className="admin-card">
      <h2>Find your order</h2>
      <p>Use your order reference and the email used at checkout.</p>
      <form onSubmit={find}>
        <label className="field-label">Order reference<input required value={number} onChange={event => setNumber(event.target.value)} /></label>
        <label className="field-label">Email address<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        {error && <p className="error-note">{error}</p>}
        <button className="button dark" type="submit">Look up order</button>
      </form>
    </section>
    {result && <section className="admin-card"><h2>Order {result.number}</h2><p>Type: {result.orderType === 'WHOLESALE' ? 'Wholesale' : 'Retail'} · Status: {result.status} · Payment: {result.paymentStatus} · Total: {money(result.total)}</p><p>Placed {new Date(result.createdAt).toLocaleDateString()}</p>{result.items.map((item: any) => <div className="admin-product" key={item.id}><strong>{item.productName} × {item.quantity}</strong><span>{item.color} {item.size} {item.fitting === 'CUSTOM' ? '· Custom measurements' : ''}</span></div>)}</section>}
  </main>;
}
