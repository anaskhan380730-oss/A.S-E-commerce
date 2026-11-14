import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const customers = await db.customer.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, name: true, email: true, phone: true, city: true, country: true, createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  return NextResponse.json(customers.map(({ _count, ...customer }) => ({ ...customer, orderCount: _count.orders })), { headers: { 'Cache-Control': 'no-store' } });
}
