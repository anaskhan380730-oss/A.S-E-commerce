import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
const returnStatus = z.enum(['NONE', 'REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED']);

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, number: true, customerName: true, phone: true, total: true, shipping: true, status: true, paymentStatus: true, returnStatus: true, returnNotes: true, returnUpdatedAt: true, createdAt: true, items: { select: { productName: true, quantity: true, color: true, size: true } } },
  });
  return NextResponse.json(orders);
}

export async function PATCH(req: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = z.object({ id: z.string(), returnStatus, returnNotes: z.string().max(2000).optional() }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, returnStatus: nextStatus, returnNotes } = parsed.data;
  const exists = await db.order.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const updated = await db.order.update({ where: { id }, data: { returnStatus: nextStatus, returnNotes, returnUpdatedAt: nextStatus === 'NONE' ? null : new Date(), ...(nextStatus === 'REFUNDED' ? { paymentStatus: 'REFUNDED' } : {}) } });
  return NextResponse.json(updated);
}
