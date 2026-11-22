import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/customer-auth';
import { CUSTOMER_CANCELLABLE_STATUSES } from '@/lib/order-cancel';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const number = url.searchParams.get('number')?.trim() || '';
  const email = url.searchParams.get('email')?.trim() || '';
  if (!number || !email) return NextResponse.json({ error: 'Enter an order reference and email.' }, { status: 400 });
  if (!await checkRateLimit(req, 'order-lookup', 30)) return NextResponse.json({ error: 'Too many lookups. Please wait a few minutes and try again.' }, { status: 429 });
  const order = await db.order.findFirst({
    where: { number, email: { equals: email, mode: 'insensitive' } },
    select: {
      number: true, orderType: true, status: true, paymentMethod: true, paymentStatus: true, total: true, createdAt: true,
      items: { select: { id: true, productName: true, quantity: true, color: true, size: true, fitting: true } },
      cancellation: { select: { reason: true, createdAt: true } },
    },
  });
  if (!order) return NextResponse.json({ error: 'No matching order found.' }, { status: 404 });
  const canCancel = CUSTOMER_CANCELLABLE_STATUSES.includes(order.status) && order.paymentStatus !== 'PAID';
  return NextResponse.json({ ...order, canCancel });
}
