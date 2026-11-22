'use client';

import { useState } from 'react';
import Link from 'next/link';
import { money } from '@/lib/money';

export default function Account() {
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function find(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setReason('');
    const response = await fetch(`/api/orders/lookup?number=${encodeURIComponent(number)}&email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (!response.ok) { setResult(null); setError(data.error); }
    else setResult(data);
  }

  async function cancelOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!result) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ number: result.number, email, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not cancel the order.');
      setMessage('Order cancelled. Stock has been restored.');
      setResult({ ...result, status: 'CANCELLED', canCancel: false, cancellation: { reason, createdAt: new Date().toISOString() } });
      setReason('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not cancel the order.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="page-wrap admin-wrap">
    <div className="collection-title">
      <span className="eyebrow">ORDER HELP</span>
      <h1>Find your order</h1>
      <p>Use your order reference and the email you entered at checkout. No account is required.</p>
    </div>

    <section className="admin-card">
      <h2>Look up an order</h2>
      <form onSubmit={find}>
        <label className="field-label">Order reference<input required value={number} onChange={event => setNumber(event.target.value)} placeholder="ASC-…"/></label>
        <label className="field-label">Checkout email<input type="email" required value={email} onChange={event => setEmail(event.target.value)}/></label>
        {error && <p className="error-note">{error}</p>}
        {message && <p className="success-note">{message}</p>}
        <button className="button dark" type="submit">Look up order</button>
      </form>
    </section>

    {result && <section className="admin-card">
      <h2>Order {result.number}</h2>
      <p>Type: {result.orderType === 'WHOLESALE' ? 'Wholesale' : 'Retail'} · Status: {result.status} · Payment: {result.paymentStatus} · Total: {money(result.total)}</p>
      <p>Placed {new Date(result.createdAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}</p>
      {result.cancellation?.reason && <p className="error-note">Cancelled reason: {result.cancellation.reason}</p>}
      {result.items.map((item: any) => <div className="admin-product" key={item.id}><strong>{item.productName} × {item.quantity}</strong><span>{item.color} {item.size} {item.fitting === 'CUSTOM' ? '· Custom measurements' : ''}</span></div>)}

      {result.canCancel && <form className="admin-form" onSubmit={cancelOrder}>
        <h3>Cancel this order</h3>
        <p className="small-note">Pending or confirmed unpaid orders can be cancelled online. Please tell us why.</p>
        <label className="field-label">Cancellation reason<textarea required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Changed my mind, wrong size, found another option…"/></label>
        <button className="button" disabled={busy || reason.trim().length < 3}>{busy ? 'Cancelling…' : 'Cancel order'}</button>
      </form>}
    </section>}

    <p><Link className="text-link" href="/cart">Back to checkout</Link></p>
  </main>;
}
