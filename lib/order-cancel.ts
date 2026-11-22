import type { Prisma } from '@/generated/prisma/client';

export class OrderStateError extends Error {}

export const CUSTOMER_CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED'];

type Tx = Prisma.TransactionClient;
type StockItem = { variantId: string | null; productId: string; productName: string; color: string | null; size: string | null; quantity: number };

async function findVariant(tx: Tx, item: StockItem) {
  return item.variantId
    ? tx.variant.findUnique({ where: { id: item.variantId } })
    : tx.variant.findFirst({ where: { productId: item.productId, color: item.color, size: item.size } });
}

export async function cancelOrderInTx(tx: Tx, orderId: string, options: { reason: string; canceledBy: 'CUSTOMER' | 'ADMIN' | 'SYSTEM'; allowedStatuses?: string[] }) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new OrderStateError('Order not found.');
  if (order.status === 'CANCELLED') throw new OrderStateError('This order is already cancelled.');
  if (options.allowedStatuses && !options.allowedStatuses.includes(order.status)) {
    throw new OrderStateError('This order is already being prepared or shipped, so it can no longer be cancelled online. Please contact the store on WhatsApp.');
  }
  const claim = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: 'CANCELLED' } });
  if (claim.count !== 1) throw new OrderStateError('This order was just updated. Refresh and try again.');
  for (const item of order.items) {
    const variant = await findVariant(tx, item);
    if (!variant) throw new OrderStateError(`Could not restore stock for ${item.productName}.`);
    await tx.variant.update({ where: { id: variant.id }, data: { stock: { increment: item.quantity } } });
  }
  const snapshot = { orderNumber: order.number, customerName: order.customerName, email: order.email, phone: order.phone, total: order.total };
  await tx.canceledOrder.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, ...snapshot, reason: options.reason, canceledBy: options.canceledBy },
    update: { ...snapshot, reason: options.reason, canceledBy: options.canceledBy, followUpStatus: 'PENDING' },
  });
  return order;
}

export async function reopenOrderInTx(tx: Tx, orderId: string, status: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new OrderStateError('Order not found.');
  const claim = await tx.order.updateMany({ where: { id: order.id, status: 'CANCELLED' }, data: { status } });
  if (claim.count !== 1) throw new OrderStateError('This order was just updated. Refresh and try again.');
  for (const item of order.items) {
    const variant = await findVariant(tx, item);
    if (!variant || variant.stock < item.quantity) throw new OrderStateError(`Not enough stock to reopen ${item.productName}.`);
    await tx.variant.update({ where: { id: variant.id }, data: { stock: { decrement: item.quantity } } });
  }
  await tx.canceledOrder.deleteMany({ where: { orderId: order.id } });
}
