import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSafepayCheckoutUrl } from '@/lib/payments/safepay';

const schema = z.object({ orderNumber: z.string().min(8).max(140), tracker: z.string().startsWith('track_').max(100) });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid payment retry request.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Payment reference is missing.' }, { status: 400 });
  const { orderNumber, tracker } = parsed.data;
  const order = await db.order.findUnique({ where: { number: orderNumber }, select: { number: true, paymentMethod: true, paymentStatus: true, status: true, providerReference: true } });
  if (!order || order.paymentMethod !== 'CARD' || order.providerReference !== tracker) {
    return NextResponse.json({ error: 'This payment reference does not match the order.' }, { status: 404 });
  }
  if (order.paymentStatus === 'PAID') return NextResponse.json({ error: 'This order has already been paid.' }, { status: 409 });
  if (order.status === 'CANCELLED') return NextResponse.json({ error: 'This order has been cancelled.' }, { status: 409 });
  try {
    const checkoutUrl = await createSafepayCheckoutUrl(tracker, order.number);
    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Safepay checkout could not be restarted.' }, { status: 503 });
  }
}
