import Link from 'next/link';
import { redirect } from 'next/navigation';
import CustomerSignOut from '@/components/customer-account-controls';
import { getCustomer } from '@/lib/auth';
import { db } from '@/lib/db';
import { money } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function CustomerProfilePage() {
  const customer = await getCustomer();
  if (!customer) redirect('/account/login?returnTo=%2Faccount%2Fprofile');
  const orders = await db.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, number: true, orderType: true, status: true, paymentStatus: true, total: true, createdAt: true, items: { select: { id: true, productName: true, quantity: true, color: true, size: true } } },
  });
  return <main className="page-wrap admin-wrap customer-profile-page">
    <div className="collection-title"><span className="eyebrow">CUSTOMER ACCOUNT</span><h1>Hello, {customer.name}</h1><p>{customer.email}</p></div>
    <section className="admin-card customer-profile-details"><div><h2>Saved delivery details</h2><p>{[customer.phone, customer.address, customer.city, customer.country].filter(Boolean).join(' · ') || 'Your delivery details will appear here after your first order.'}</p></div><CustomerSignOut /></section>
    <section className="admin-card"><div className="admin-abandoned-heading"><div><h2>Your orders</h2><p>Your recent orders placed while signed in.</p></div><Link href="/account" className="button">Order lookup</Link></div>
      {!orders.length ? <p>No orders yet. <Link href="/collections/new-arrivals">Browse the collection</Link>.</p> : orders.map(order => <article className="customer-order" key={order.id}>
        <div className="customer-order-heading"><div><strong>{order.number}</strong><small>{order.orderType === 'WHOLESALE' ? 'Wholesale' : 'Retail'} · {new Date(order.createdAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}</small></div><strong>{money(order.total)}</strong></div>
        <p>{order.status} · Payment {order.paymentStatus}</p>
        <ul>{order.items.map(item => <li key={item.id}>{item.productName} × {item.quantity}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}</li>)}</ul>
      </article>)}
    </section>
  </main>;
}
