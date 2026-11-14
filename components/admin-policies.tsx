'use client';

import { useEffect, useState } from 'react';
import { defaultPolicies } from '@/lib/policy-content';

type Policies = { shippingPolicy: string; returnsPolicy: string; privacyPolicy: string; termsPolicy: string };

const fields: { key: keyof Policies; title: string; help: string }[] = [
  { key: 'shippingPolicy', title: 'Shipping & delivery', help: 'Retail: estimated 4–6 days. Wholesale: estimated 12–15 days. International destinations, delivery fees, card-only checkout, and delivery estimates are controlled in Settings.' },
  { key: 'returnsPolicy', title: 'Returns & exchanges', help: 'Set the exact eligibility, contact window, and refund or exchange process that your store can honor.' },
  { key: 'privacyPolicy', title: 'Privacy', help: 'Explains customer account and order information, and courier details.' },
  { key: 'termsPolicy', title: 'Terms of service', help: 'Explains order confirmation, stock, COD, wholesale minimum, and international delivery rules.' },
];

export default function AdminPolicies() {
  const [policies, setPolicies] = useState<Policies>({ ...defaultPolicies });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/admin/policies', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not load store policies.');
        if (active) setPolicies(result);
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Could not load store policies.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/policies', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(policies) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not save store policies.');
      setPolicies(result);
      setMessage('Policies saved. The updated text is now shown on the public policy pages.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save store policies.');
    } finally { setBusy(false); }
  }

  return <section className="admin-card admin-policies">
    <h2>Store policies</h2>
    <p>Edit the customer-facing policy pages. Links appear in the website footer and checkout. The return policy is a starter draft; set only time limits and conditions your store can honor.</p>
    {loading ? <p>Loading policies…</p> : <form onSubmit={save}>
      {fields.map(field => <label className="field-label" key={field.key}>{field.title}<small>{field.help}</small><textarea required minLength={30} maxLength={12000} rows={8} value={policies[field.key]} onChange={event => setPolicies(current => ({ ...current, [field.key]: event.target.value }))}/></label>)}
      {message && <p className={message.startsWith('Policies saved') ? 'success-note' : 'error-note'} role="status">{message}</p>}
      <button className="button dark" disabled={busy}>{busy ? 'Saving policies…' : 'Save all policies'}</button>
    </form>}
  </section>;
}
