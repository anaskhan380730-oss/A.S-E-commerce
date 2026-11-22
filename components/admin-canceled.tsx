'use client';

import { useCallback, useEffect, useState } from 'react';

type Canceled = {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string;
  total: number;
  reason: string;
  canceledBy: string;
  followUpStatus: string;
  adminNotes: string | null;
  createdAt: string;
  order?: { status: string; paymentStatus: string; paymentMethod: string };
};

export default function AdminCanceled() {
  const [rows, setRows] = useState<Canceled[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/canceled-orders', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load canceled orders.');
      setRows(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load canceled orders.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(row: Canceled, followUpStatus: string, adminNotes: string) {
    setMessage('');
    const response = await fetch('/api/admin/canceled-orders', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: row.id, followUpStatus, adminNotes }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Could not save follow-up.'); return; }
    setMessage(`Saved follow-up for ${row.orderNumber}.`);
    await load();
  }

  return <section className="admin-card">
    <div className="admin-abandoned-heading">
      <div><h2>Canceled orders · {rows.length}</h2><p>Review the cancellation reason, then decide whether to call or message the customer.</p></div>
      <button className="button" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <p className="error-note">{error}</p>}
    {message && <p className="success-note">{message}</p>}
    {!rows.length && !loading ? <p>No canceled orders yet.</p> : rows.map(row => (
      <details className="admin-order" key={row.id}>
        <summary><strong>{row.orderNumber}</strong> · {row.customerName} · Rs {row.total} · {row.canceledBy} · {row.followUpStatus}</summary>
        <p>{row.phone} · {row.email}</p>
        <p><strong>Reason:</strong> {row.reason}</p>
        <p>Cancelled {new Date(row.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} · Payment {row.order?.paymentStatus || '—'} · Method {row.order?.paymentMethod || '—'}</p>
        <form className="admin-form" onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save(row, String(form.get('followUpStatus')), String(form.get('adminNotes') || ''));
        }}>
          <label className="field-label">Follow-up status<select name="followUpStatus" defaultValue={row.followUpStatus}>{['PENDING', 'CALLED', 'MESSAGED', 'NO_ACTION'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="field-label">Admin notes<textarea name="adminNotes" defaultValue={row.adminNotes || ''} maxLength={2000}/></label>
          <button className="button dark">Save follow-up</button>
        </form>
      </details>
    ))}
  </section>;
}
