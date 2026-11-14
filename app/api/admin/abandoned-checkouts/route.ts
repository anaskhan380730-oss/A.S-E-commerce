import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  await db.abandonedCheckout.deleteMany({ where: { expiresAt: { lte: now } } });
  const checkouts = await db.abandonedCheckout.findMany({
    where: { expiresAt: { gt: now } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true, customerName: true, email: true, phone: true, address: true, city: true, country: true,
      emailConsent: true, whatsappConsent: true, purchaseType: true, items: true, status: true,
      expiresAt: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json(checkouts);
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const parsed = z.object({ id: z.string().min(1), status: z.enum(['OPEN', 'CONTACTED', 'RESOLVED']) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await db.abandonedCheckout.update({ where: { id: parsed.data.id }, data: { status: parsed.data.status } }));
  } catch {
    return NextResponse.json({ error: 'Checkout record not found.' }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const parsed = z.object({ id: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await db.abandonedCheckout.deleteMany({ where: { id: parsed.data.id } });
  return NextResponse.json({ ok: true });
}
