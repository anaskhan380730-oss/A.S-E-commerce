import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkRateLimit, readJson } from '@/lib/customer-auth';

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const text = (max: number) => z.string().trim().max(max).optional().transform(value => value || null);

const schema = z.object({
  sessionKey: z.string().uuid(),
  step: z.enum(['opened', 'contact', 'delivery', 'payment']).default('opened'),
  customerName: text(120),
  phone: text(25),
  email: text(200),
  address: text(1000),
  city: text(100),
  country: text(100),
  purchaseType: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  items: z.array(z.object({
    productId: z.string().max(60),
    name: z.string().max(200),
    quantity: z.number().int().min(1).max(10000),
    price: z.number().int().min(0).max(100000000),
    color: z.string().max(80).optional(),
    size: z.string().max(40).optional(),
  })).max(30),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout details.' }, { status: 400 });
  if (!await checkRateLimit(request, 'checkout-progress', 300)) {
    return NextResponse.json({ error: 'Too many updates. Your details will be saved when you place the order.' }, { status: 429 });
  }
  const { sessionKey, step, items, ...fields } = parsed.data;
  const existing = await db.suspect.findUnique({ where: { sessionKey }, select: { status: true } });
  if (existing?.status === 'CONVERTED') return NextResponse.json({ saved: false, converted: true });

  const data = { ...fields, items, lastStep: step, expiresAt: new Date(Date.now() + RETENTION_MS) };
  try {
    await db.suspect.upsert({ where: { sessionKey }, create: { sessionKey, ...data }, update: data });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
    if (code !== 'P2002') throw error;
    await db.suspect.updateMany({ where: { sessionKey, status: { not: 'CONVERTED' } }, data });
  }
  return NextResponse.json({ saved: true });
}
