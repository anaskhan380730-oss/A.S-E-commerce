'use client';

import { useCallback, useEffect, useState } from 'react';

type Customer = {
  key: string;
  customerName: string;
  email: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderId: string;
  lastOrderNumber: string;
  lastDeliveredAt: string;
  feedbackDue: boolean;
  feedbackStatus: string | null;
  feedbackSentAt: string | null;
};

export default function AdminSuccessfulCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/successful-customers', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load successful customers.');
      setCustomers(data.customers || []);
      setMonths(data.feedbackAfterMonths || 6);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load successful customers.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function sendFeedback(lastOrderId: string) {
    setMessage('');
    const response = await fetch('/api/admin/successful-customers', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastOrderId }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Feedback request failed.'); return; }
    setMessage(data.result?.status === 'LOGGED'
      ? 'Feedback queued in log mode (WhatsApp API not connected yet). A wa.me link is ready for manual send.'
      : `Feedback request ${data.result?.status?.toLowerCase() || 'sent'}.`);
    if (data.whatsappUrl) window.open(data.whatsappUrl, '_blank', 'noopener,noreferrer');
    await load();
  }

  return <section className="admin-card">
    <div className="admin-abandoned-heading">
      <div>
        <h2>Successful customers · delivered only · {customers.length}</h2>
        <p>Only people with at least one delivered order. Incomplete checkouts stay in Suspects. Feedback is due after {months} months with no new order.</p>
      </div>
      <button className="button" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <p className="error-note">{error}</p>}
    {message && <p className="success-note">{message}</p>}
    {!customers.length && !loading ? <p>No delivered orders yet.</p> : <div className="admin-table-wrap"><table className="admin-data-table">
      <thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Spent</th><th>Last delivered</th><th>Feedback</th></tr></thead>
      <tbody>{customers.map(customer => (
        <tr key={customer.key}>
          <td>{customer.customerName}<br/><small>{customer.lastOrderNumber}</small></td>
          <td>{customer.phone}<br/><small>{customer.email}</small></td>
          <td>{customer.orderCount}</td>
          <td>Rs {customer.totalSpent.toLocaleString('en-PK')}</td>
          <td>{new Date(customer.lastDeliveredAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}</td>
          <td>
            {customer.feedbackStatus ? <span>{customer.feedbackStatus}{customer.feedbackSentAt ? ` · ${new Date(customer.feedbackSentAt).toLocaleDateString('en-PK')}` : ''}</span>
              : customer.feedbackDue ? <button type="button" onClick={() => void sendFeedback(customer.lastOrderId)}>Send feedback</button>
                : <span>Not due yet</span>}
          </td>
        </tr>
      ))}</tbody>
    </table></div>}
  </section>;
}
