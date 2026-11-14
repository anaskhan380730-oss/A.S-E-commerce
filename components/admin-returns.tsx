'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ReturnStatus = 'NONE' | 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'REFUNDED' | 'REJECTED';
type ReturnOrder = {
  id: string; number: string; customerName: string; phone: string; total: number; shipping: number;
  status: string; paymentStatus: string; returnStatus: ReturnStatus; returnNotes: string | null;
  returnUpdatedAt: string | null; createdAt: string;
  items: { productName: string; quantity: number; color: string | null; size: string | null }[];
};
const statuses: ReturnStatus[] = ['NONE', 'REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED'];
const statusLabels: Record<ReturnStatus, string> = { NONE: 'No return', REQUESTED: 'Requested', APPROVED: 'Approved', RECEIVED: 'Received', REFUNDED: 'Refunded', REJECTED: 'Rejected' };
const money = (value: number) => `PKR ${new Intl.NumberFormat('en-PK').format(value || 0)}`;

export default function AdminReturns() {
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { status: ReturnStatus; notes: string }>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'OPEN' | 'ALL' | 'CLOSED'>('OPEN');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/returns', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load returns.');
      setOrders(body);
      setDrafts(Object.fromEntries(body.map((order: ReturnOrder) => [order.id, { status: order.returnStatus, notes: order.returnNotes || '' }])));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not load returns.'); }
    finally { setLoading(false); }
  }, []);
  const refresh = () => { setLoading(true); setMessage(''); void load(); };
  useEffect(() => {
    let active = true;
    fetch('/api/admin/returns', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load returns.');
        return body as ReturnOrder[];
      })
      .then(body => {
        if (!active) return;
        setOrders(body);
        setDrafts(Object.fromEntries(body.map(order => [order.id, { status: order.returnStatus, notes: order.returnNotes || '' }])));
      })
      .catch(cause => { if (active) setMessage(cause instanceof Error ? cause.message : 'Could not load returns.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const matching = useMemo(() => orders.filter(order => {
    const text = `${order.number} ${order.customerName} ${order.phone}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter === 'OPEN') return ['REQUESTED', 'APPROVED'].includes(order.returnStatus);
    if (filter === 'CLOSED') return ['RECEIVED', 'REFUNDED', 'REJECTED'].includes(order.returnStatus);
    return true;
  }), [orders, query, filter]);

  async function save(order: ReturnOrder) {
    const draft = drafts[order.id]; if (!draft) return;
    setBusy(order.id); setMessage('');
    try {
      const response = await fetch('/api/admin/returns', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: order.id, returnStatus: draft.status, returnNotes: draft.notes }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save return update.');
      setOrders(current => current.map(item => item.id === order.id ? { ...item, returnStatus: body.returnStatus, returnNotes: body.returnNotes, returnUpdatedAt: body.returnUpdatedAt } : item));
      setMessage(`Return record saved for ${order.number}.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not save return update.'); }
    finally { setBusy(null); }
  }

  const openCount = orders.filter(order => ['REQUESTED', 'APPROVED'].includes(order.returnStatus)).length;
  const completedCount = orders.filter(order => ['RECEIVED', 'REFUNDED'].includes(order.returnStatus)).length;
  return <section className="admin-returns">
    <div className="admin-overview-heading"><div><span className="eyebrow">AFTER-SALES</span><h2>Returns &amp; exchanges</h2><p>Track customer return requests against the original order.</p></div><button className="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <div className="admin-return-summary"><div><strong>{openCount}</strong><span>Open cases</span></div><div><strong>{completedCount}</strong><span>Received or refunded</span></div><div><strong>{orders.length}</strong><span>Orders checked</span></div></div>
    <div className="admin-return-controls"><input aria-label="Search returns" placeholder="Search order, customer or phone" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Filter return orders" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="OPEN">Open cases</option><option value="CLOSED">Closed cases</option><option value="ALL">All recent orders</option></select></div>
    {message && <p className={message.startsWith('Return record') ? 'success-note' : 'error-note'}>{message}</p>}
    {loading && !orders.length ? <div className="admin-card"><p>Loading return records…</p></div> : matching.length ? matching.map(order => {
      const draft = drafts[order.id] || { status: order.returnStatus, notes: order.returnNotes || '' };
      return <article className="admin-return-card" key={order.id}>
        <div className="admin-return-title"><div><span className="eyebrow">{order.number}</span><h3>{order.customerName}</h3><p>{order.phone} · placed {new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeZone: 'Asia/Karachi' }).format(new Date(order.createdAt))}</p></div><div><strong>{money(order.total)}</strong><small>Order: {order.status} · Payment: {order.paymentStatus}</small></div></div>
        <div className="admin-return-items">{order.items.map((item, index) => <span key={`${item.productName}-${index}`}>{item.productName} × {item.quantity} · {[item.color, item.size].filter(Boolean).join(' / ') || 'Standard'}</span>)}</div>
        <div className="admin-return-edit"><label className="field-label">Return status<select value={draft.status} onChange={event => setDrafts(current => ({ ...current, [order.id]: { ...draft, status: event.target.value as ReturnStatus } }))}>{statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label className="field-label">Internal note<textarea maxLength={2000} rows={2} placeholder="Reason, inspection, courier/refund reference…" value={draft.notes} onChange={event => setDrafts(current => ({ ...current, [order.id]: { ...draft, notes: event.target.value } }))} /></label><button className="button dark" onClick={() => void save(order)} disabled={busy === order.id}>{busy === order.id ? 'Saving…' : 'Save return update'}</button></div>
        {order.returnUpdatedAt && <small className="admin-return-updated">Last updated {new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }).format(new Date(order.returnUpdatedAt))}</small>}
      </article>;
    }) : <div className="admin-card"><h3>No matching return orders</h3><p>New orders start with “No return”. Set one to “Requested” when a customer contacts you about a return.</p></div>}
    <p className="admin-footnote">Changing a return status records the case only. Check the parcel and decide whether it can be restocked before adjusting inventory. Refunds must also be issued through your chosen payment method.</p>
  </section>;
}
