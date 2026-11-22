import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { readJson } from '@/lib/customer-auth';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.canceledOrder.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { order: { select: { status: true, paymentStatus: true, paymentMethod: true, createdAt: true } } },
  });
  return NextResponse.json(rows);
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = z.object({
    id: z.string().min(1),
    followUpStatus: z.enum(['PENDING', 'CALLED', 'MESSAGED', 'NO_ACTION']),
    adminNotes: z.string().trim().max(2000).optional(),
  }).safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid follow-up update.' }, { status: 400 });
  try {
    return NextResponse.json(await db.canceledOrder.update({
      where: { id: parsed.data.id },
      data: { followUpStatus: parsed.data.followUpStatus, adminNotes: parsed.data.adminNotes },
    }));
  } catch {
    return NextResponse.json({ error: 'Canceled order not found.' }, { status: 404 });
  }
}
