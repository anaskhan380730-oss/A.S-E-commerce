'use client';

import { useCallback, useEffect, useState } from 'react';

type Customer = { id: string; name: string; email: string; phone: string | null; city: string | null; country: string | null; createdAt: string; orderCount: number };

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/customers', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load customers.');
      setCustomers(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load customers.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <section className="admin-card">
    <div className="admin-abandoned-heading"><div><h2>Customer accounts · latest {customers.length}</h2><p>Registered accounts and completed orders, up to the latest 100.</p></div><button className="button" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && <p className="error-note">{error}</p>}
    {loading && !customers.length ? <p>Loading customer accounts…</p> : !customers.length ? <p>No customer accounts yet.</p> : <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Location</th><th>Orders</th><th>Joined</th></tr></thead><tbody>{customers.map(customer => <tr key={customer.id}><td>{customer.name}</td><td>{customer.email}</td><td>{customer.phone || '—'}</td><td>{[customer.city, customer.country].filter(Boolean).join(', ') || '—'}</td><td>{customer.orderCount}</td><td>{new Date(customer.createdAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}</td></tr>)}</tbody></table></div>}
  </section>;
}
