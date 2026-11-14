import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { markSafepayOrderPaid } from '@/lib/payments/reconcile';
import { fetchSafepayTracker, trackerPaymentAmount } from '@/lib/payments/safepay';

const schema = z.object({ orderNumber: z.string().min(8).max(140), tracker: z.string().startsWith('track_').max(100) });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid payment confirmation request.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Payment reference is missing.' }, { status: 400 });
  const { orderNumber, tracker } = parsed.data;
  const order = await db.order.findUnique({ where: { number: orderNumber } });
  if (!order || order.paymentMethod !== 'CARD' || order.providerReference !== tracker) {
    return NextResponse.json({ error: 'This payment reference does not match the order.' }, { status: 404 });
  }
  if (order.paymentStatus === 'PAID') return NextResponse.json({ orderNumber, paymentStatus: 'PAID' });
  if (order.status === 'CANCELLED') return NextResponse.json({ error: 'This order has been cancelled.' }, { status: 409 });

  try {
    const payment = await fetchSafepayTracker(tracker);
    const amount = payment ? trackerPaymentAmount(payment) : null;
    const matchesAmount = amount?.currency === 'PKR' && amount.amount === order.total * 100;
    if (payment?.token === tracker && payment.state === 'TRACKER_ENDED' && matchesAmount) {
      const paid = await markSafepayOrderPaid(tracker);
      if (paid) return NextResponse.json({ orderNumber, paymentStatus: 'PAID' });
      return NextResponse.json({ error: 'The order could not be confirmed. Please contact the store.' }, { status: 409 });
    }
    return NextResponse.json({ orderNumber, paymentStatus: 'UNPAID', message: 'Safepay has not confirmed this payment yet.' }, { status: 202 });
  } catch {
    return NextResponse.json({ orderNumber, paymentStatus: 'PENDING', message: 'Payment confirmation is still being checked.' }, { status: 202 });
  }
}
