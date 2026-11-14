import { db } from '@/lib/db';

export async function markSafepayOrderPaid(tracker: string) {
  const order = await db.order.findUnique({ where: { providerReference: tracker } });
  if (!order || order.paymentMethod !== 'CARD' || order.status === 'CANCELLED') return false;
  if (order.paymentStatus === 'PAID') return true;
  const updated = await db.order.updateMany({
    where: { id: order.id, providerReference: tracker, paymentMethod: 'CARD', paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
    data: { paymentStatus: 'PAID', paidCurrency: 'PKR', paidAmountMinor: order.total, status: 'CONFIRMED' },
  });
  return updated.count === 1;
}
