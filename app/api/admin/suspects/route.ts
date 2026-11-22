import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { readJson } from '@/lib/customer-auth';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  await db.suspect.deleteMany({ where: { expiresAt: { lte: now } } });
  const suspects = await db.suspect.findMany({
    where: {
      status: { not: 'CONVERTED' },
      OR: [{ customerName: { not: null } }, { phone: { not: null } }, { email: { not: null } }],
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: {
      id: true, customerName: true, email: true, phone: true, address: true, city: true, country: true,
      purchaseType: true, items: true, status: true, lastStep: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json(suspects);
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = z.object({ id: z.string().min(1), status: z.enum(['OPEN', 'CONTACTED', 'RESOLVED']) }).safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid suspect update.' }, { status: 400 });
  const updated = await db.suspect.updateMany({ where: { id: parsed.data.id, status: { not: 'CONVERTED' } }, data: { status: parsed.data.status } });
  if (!updated.count) return NextResponse.json({ error: 'Suspect record not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = z.object({ id: z.string().min(1) }).safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  await db.suspect.deleteMany({ where: { id: parsed.data.id, status: { not: 'CONVERTED' } } });
  return NextResponse.json({ ok: true });
}
