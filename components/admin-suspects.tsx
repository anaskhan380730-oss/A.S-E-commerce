'use client';

import { useCallback, useEffect, useState } from 'react';

type Suspect = {
  id: string;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  purchaseType: string;
  items: Array<{ name?: string; quantity?: number; color?: string; size?: string }>;
  status: string;
  lastStep: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function AdminSuspects() {
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/suspects', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load suspects.');
      setSuspects(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load suspects.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(id: string, status: 'OPEN' | 'CONTACTED' | 'RESOLVED') {
    setMessage('');
    const response = await fetch('/api/admin/suspects', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Update failed.'); return; }
    setMessage(`Marked as ${status.toLowerCase()}.`);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this suspect record?')) return;
    const response = await fetch('/api/admin/suspects', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Delete failed.'); return; }
    setMessage('Suspect deleted.');
    await load();
  }

  return <section className="admin-card">
    <div className="admin-abandoned-heading">
      <div>
        <h2>Suspects · incomplete checkouts · {suspects.length}</h2>
        <p>Visitors who typed checkout details but did not place an order. These are not customers.</p>
      </div>
      <button className="button" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <p className="error-note">{error}</p>}
    {message && <p className="success-note">{message}</p>}
    {!suspects.length && !loading ? <p>No incomplete checkouts yet.</p> : suspects.map(suspect => (
      <details className="admin-order" key={suspect.id}>
        <summary>
          <strong>{suspect.customerName || 'No name yet'}</strong>
          {' · '}{suspect.phone || 'No WhatsApp'}
          {' · '}{suspect.status}
          {' · '}{suspect.lastStep || 'opened'}
          {' · '}{new Date(suspect.updatedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
        </summary>
        <p>{suspect.email || 'No email'} · {[suspect.address, suspect.city, suspect.country].filter(Boolean).join(', ') || 'No address yet'}</p>
        <p>Type: {suspect.purchaseType}</p>
        <ul>{(Array.isArray(suspect.items) ? suspect.items : []).map((item, index) => <li key={index}>{item.name || 'Item'} × {item.quantity || 1}{[item.color, item.size].filter(Boolean).length ? ` · ${[item.color, item.size].filter(Boolean).join(' / ')}` : ''}</li>)}</ul>
        <div className="check-row">
          <button type="button" onClick={() => void updateStatus(suspect.id, 'CONTACTED')}>Mark contacted</button>
          <button type="button" onClick={() => void updateStatus(suspect.id, 'RESOLVED')}>Mark resolved</button>
          <button type="button" onClick={() => void updateStatus(suspect.id, 'OPEN')}>Reopen</button>
          <button type="button" onClick={() => void remove(suspect.id)}>Delete</button>
        </div>
      </details>
    ))}
  </section>;
}
