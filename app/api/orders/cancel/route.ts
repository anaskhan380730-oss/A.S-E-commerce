import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkRateLimit, readJson } from '@/lib/customer-auth';
import { cancelOrderInTx, CUSTOMER_CANCELLABLE_STATUSES, OrderStateError } from '@/lib/order-cancel';

const schema = z.object({
  number: z.string().trim().min(3).max(100),
  email: z.string().trim().email('Enter the email used at checkout.'),
  reason: z.string().trim().min(3, 'Please tell us why you are cancelling (at least 3 characters).').max(1000),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid cancellation request.' }, { status: 400 });
  if (!await checkRateLimit(req, 'order-cancel', 10)) return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, { status: 429 });
  const { number, email, reason } = parsed.data;
  const order = await db.order.findFirst({ where: { number, email: { equals: email, mode: 'insensitive' } }, select: { id: true, paymentStatus: true } });
  if (!order) return NextResponse.json({ error: 'No matching order found.' }, { status: 404 });
  if (order.paymentStatus === 'PAID') {
    return NextResponse.json({ error: 'This order is already paid by card. Please contact the store on WhatsApp to cancel it and arrange a refund.' }, { status: 409 });
  }
  try {
    await db.$transaction(tx => cancelOrderInTx(tx, order.id, { reason, canceledBy: 'CUSTOMER', allowedStatuses: CUSTOMER_CANCELLABLE_STATUSES }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OrderStateError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Customer cancellation failed:', error);
    return NextResponse.json({ error: 'Could not cancel the order. Please try again or contact the store.' }, { status: 500 });
  }
}
