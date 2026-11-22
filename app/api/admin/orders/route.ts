import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { readJson } from '@/lib/customer-auth';
import { cancelOrderInTx, OrderStateError, reopenOrderInTx } from '@/lib/order-cancel';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await db.order.findMany({ include: { items: true, cancellation: true }, orderBy: { createdAt: 'desc' }, take: 100 }));
}

const schema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  paidCurrency: z.enum(['PKR', 'USD']).optional(),
  stitchingStatus: z.enum(['NOT_REQUIRED', 'NEEDS_REVIEW', 'APPROVED', 'IN_PRODUCTION', 'COMPLETE']),
  stitchingNotes: z.string().max(2000).optional(),
  cancellationReason: z.string().trim().max(1000).optional(),
});

export async function PATCH(req: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, status, cancellationReason, ...data } = parsed.data;
  try {
    return await db.$transaction(async tx => {
      const current = await tx.order.findUnique({ where: { id } });
      if (!current) throw new OrderStateError('Order not found.');
      if (current.status !== 'CANCELLED' && status === 'CANCELLED') {
        if (!cancellationReason || cancellationReason.length < 3) throw new OrderStateError('Enter a cancellation reason (at least 3 characters).');
        await cancelOrderInTx(tx, id, { reason: cancellationReason, canceledBy: 'ADMIN' });
      } else if (current.status === 'CANCELLED' && status !== 'CANCELLED') {
        await reopenOrderInTx(tx, id, status);
      }
      const paymentCurrency = data.paidCurrency ?? current.paidCurrency ?? 'PKR';
      const shouldRecordPaid = data.paymentStatus === 'PAID' || (current.paymentStatus === 'PAID' && data.paidCurrency !== undefined);
      const paidFields = shouldRecordPaid
        ? { paidCurrency: paymentCurrency, paidAmountMinor: paymentCurrency === 'USD' ? Math.round(current.total / (Number(current.orderCurrencyRate) || 280) * 100) : current.total }
        : data.paidCurrency ? { paidCurrency: data.paidCurrency } : {};
      const order = await tx.order.update({ where: { id }, data: { ...data, status, ...paidFields }, include: { items: true, cancellation: true } });
      return NextResponse.json(order);
    });
  } catch (error) {
    if (error instanceof OrderStateError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Admin order update failed:', error);
    return NextResponse.json({ error: 'Order update failed. Please try again.' }, { status: 500 });
  }
}
