import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { markSafepayOrderPaid } from '@/lib/payments/reconcile';
import { verifySafepayWebhook, type SafepayWebhookEvent } from '@/lib/payments/safepay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySafepayWebhook(rawBody, request.headers.get('x-sfpy-signature'))) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let event: SafepayWebhookEvent;
  try { event = JSON.parse(rawBody) as SafepayWebhookEvent; }
  catch { return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 }); }
  if (event.merchant_api_key && event.merchant_api_key !== process.env.SAFEPAY_API_KEY) {
    return NextResponse.json({ error: 'Webhook belongs to a different Safepay account.' }, { status: 401 });
  }

  const data = event.data;
  if (!data?.tracker) return NextResponse.json({ received: true, ignored: true });
  const order = await db.order.findUnique({ where: { providerReference: data.tracker } });
  if (!order || order.paymentMethod !== 'CARD') return NextResponse.json({ received: true, ignored: true });

  if (event.type === 'payment.succeeded') {
    if (data.state !== 'TRACKER_ENDED' || data.currency !== 'PKR' || data.amount !== order.total * 100) {
      return NextResponse.json({ error: 'Payment details did not match the order.' }, { status: 409 });
    }
    await markSafepayOrderPaid(data.tracker);
    return NextResponse.json({ received: true });
  }

  if (event.type === 'payment.refunded') {
    const balance = typeof data.balance === 'number' ? data.balance : data.balance?.amount;
    if (data.state === 'TRACKER_REFUNDED' || balance === 0) {
      await db.order.updateMany({
        where: { id: order.id, paymentMethod: 'CARD', paymentStatus: 'PAID' },
        data: { paymentStatus: 'REFUNDED' },
      });
    }
    return NextResponse.json({ received: true });
  }

  // Failed attempts are intentionally left unpaid: Safepay can emit another
  // attempt for the same tracker when a customer retries on hosted checkout.
  return NextResponse.json({ received: true, ignored: true });
}
