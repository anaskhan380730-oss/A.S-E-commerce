import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function validDateOnly(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const startValue = url.searchParams.get('start');
  const endValue = url.searchParams.get('end');
  if (!validDateOnly(startValue) || !validDateOnly(endValue)) return NextResponse.json({ error: 'Choose a valid start and end date.' }, { status: 400 });

  const start = new Date(`${startValue}T00:00:00+05:00`);
  const endExclusive = new Date(`${endValue}T00:00:00+05:00`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  if (start >= endExclusive) return NextResponse.json({ error: 'The end date must be on or after the start date.' }, { status: 400 });
  if (endExclusive.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'Choose a date range of one year or less.' }, { status: 400 });

  const orders = await db.order.findMany({
    where: { createdAt: { gte: start, lt: endExclusive } },
    orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
    select: {
      number: true,
      customerName: true,
      city: true,
      country: true,
      orderType: true,
      orderCurrency: true,
      orderCurrencySubtotal: true,
      orderCurrencyShipping: true,
      orderCurrencyDiscount: true,
      orderCurrencyTotal: true,
      subtotal: true,
      shipping: true,
      discount: true,
      total: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      paidCurrency: true,
      paidAmountMinor: true,
      returnStatus: true,
      createdAt: true,
      items: { select: { productName: true, quantity: true, color: true, size: true } },
    },
  });

  return NextResponse.json({
    start: startValue,
    end: endValue,
    timeZone: 'Asia/Karachi',
    orders: orders.map(order => ({ ...order, createdAt: order.createdAt.toISOString() })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
