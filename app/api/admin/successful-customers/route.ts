import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { customerKey, FeedbackError, sendFeedbackRequest } from '@/lib/notifications';
import { getStoreSettings } from '@/lib/store-settings';
import { readJson } from '@/lib/customer-auth';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const settings = await getStoreSettings();
  const delivered = await db.order.findMany({
    where: { status: 'DELIVERED' },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, number: true, customerName: true, email: true, phone: true, total: true, createdAt: true },
  });

  const byCustomer = new Map<string, {
    key: string;
    customerName: string;
    email: string;
    phone: string;
    orderCount: number;
    totalSpent: number;
    lastOrderId: string;
    lastOrderNumber: string;
    lastDeliveredAt: string;
  }>();

  for (const order of delivered) {
    const key = customerKey(order.phone, order.email);
    const existing = byCustomer.get(key);
    if (!existing) {
      byCustomer.set(key, {
        key,
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        orderCount: 1,
        totalSpent: order.total,
        lastOrderId: order.id,
        lastOrderNumber: order.number,
        lastDeliveredAt: order.createdAt.toISOString(),
      });
      continue;
    }
    existing.orderCount += 1;
    existing.totalSpent += order.total;
    if (new Date(order.createdAt) > new Date(existing.lastDeliveredAt)) {
      existing.lastOrderId = order.id;
      existing.lastOrderNumber = order.number;
      existing.lastDeliveredAt = order.createdAt.toISOString();
      existing.customerName = order.customerName;
      existing.email = order.email;
      existing.phone = order.phone;
    }
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - settings.feedbackAfterMonths);
  const logs = await db.notificationLog.findMany({
    where: { kind: 'FEEDBACK_REQUEST', channel: 'WHATSAPP', referenceId: { in: [...byCustomer.values()].map(row => row.lastOrderId) } },
    select: { referenceId: true, status: true, createdAt: true },
  });
  const logByOrder = Object.fromEntries(logs.map(log => [log.referenceId, log]));

  const customers = [...byCustomer.values()]
    .map(row => {
      const lastDeliveredAt = new Date(row.lastDeliveredAt);
      const feedbackDue = lastDeliveredAt <= cutoff;
      const feedback = logByOrder[row.lastOrderId];
      return {
        ...row,
        feedbackDue,
        feedbackStatus: feedback?.status || null,
        feedbackSentAt: feedback?.createdAt?.toISOString() || null,
      };
    })
    .sort((a, b) => +new Date(b.lastDeliveredAt) - +new Date(a.lastDeliveredAt));

  return NextResponse.json({
    feedbackAfterMonths: settings.feedbackAfterMonths,
    feedbackMessage: settings.feedbackMessage,
    customers,
  });
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = z.object({ lastOrderId: z.string().min(1) }).safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a delivered order.' }, { status: 400 });
  try {
    const result = await sendFeedbackRequest(parsed.data.lastOrderId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FeedbackError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Feedback request failed:', error);
    return NextResponse.json({ error: 'Could not send feedback request.' }, { status: 500 });
  }
}
