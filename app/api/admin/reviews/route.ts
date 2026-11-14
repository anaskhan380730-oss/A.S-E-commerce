import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { removeReviewScreenshot } from '@/lib/review-screenshot-storage';

const reviewFields = z.object({
  author: z.string().trim().min(1).max(120),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(5).max(3000),
  source: z.enum(['WHATSAPP', 'FACEBOOK', 'OTHER']),
  productId: z.string().nullable().optional(),
  orderNumber: z.string().trim().max(120).optional().default(''),
  customerConsent: z.boolean(),
  screenshotConsent: z.boolean().default(false),
  approved: z.boolean().default(false),
});

async function orderReference(orderNumber: string) {
  if (!orderNumber.trim()) return { orderId: null, verifiedPurchase: false };
  const order = await db.order.findUnique({ where: { number: orderNumber.trim() }, select: { id: true } });
  if (!order) throw new Error('That order reference does not match an order in the store. Leave it blank to save this review without a verified-purchase label.');
  return { orderId: order.id, verifiedPurchase: true };
}

async function validateProduct(productId: string | null | undefined) {
  if (!productId) return;
  if (!await db.product.findUnique({ where: { id: productId }, select: { id: true } })) throw new Error('The selected product was not found.');
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const reviews = await db.review.findMany({ include: { order: { select: { number: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return NextResponse.json(reviews);
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const parsed = reviewFields.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (input.approved && !input.customerConsent) return NextResponse.json({ error: 'Get the customer’s permission before publishing this review.' }, { status: 400 });
  try {
    await validateProduct(input.productId);
    const verification = await orderReference(input.orderNumber);
    const review = await db.review.create({
      data: {
        author: input.author,
        rating: input.rating,
        body: input.body,
        source: input.source,
        productId: input.productId || null,
        orderId: verification.orderId,
        verifiedPurchase: verification.verifiedPurchase,
        customerConsent: input.customerConsent,
        screenshotConsent: input.screenshotConsent,
        approved: input.approved,
      },
      include: { order: { select: { number: true } } },
    });
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save the review.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const parsed = reviewFields.extend({ id: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, ...input } = parsed.data;
  if (input.approved && !input.customerConsent) return NextResponse.json({ error: 'Get the customer’s permission before publishing this review.' }, { status: 400 });
  try {
    await validateProduct(input.productId);
    const verification = await orderReference(input.orderNumber);
    const existing = input.screenshotConsent ? null : await db.review.findUnique({ where: { id }, select: { screenshotUrl: true, screenshotCloudinaryPublicId: true, screenshotLocalFileName: true } });
    const updated = await db.review.update({
      where: { id },
      data: {
        author: input.author,
        rating: input.rating,
        body: input.body,
        source: input.source,
        productId: input.productId || null,
        orderId: verification.orderId,
        verifiedPurchase: verification.verifiedPurchase,
        customerConsent: input.customerConsent,
        screenshotConsent: input.screenshotConsent,
        ...(input.screenshotConsent ? {} : { screenshotUrl: null, screenshotCloudinaryPublicId: null, screenshotLocalFileName: null }),
        approved: input.approved,
      },
      include: { order: { select: { number: true } } },
    });
    if (existing) await removeReviewScreenshot(existing);
    return NextResponse.json(updated);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
    return NextResponse.json({ error: code === 'P2025' ? 'Review not found.' : error instanceof Error ? error.message : 'Could not update the review.' }, { status: code === 'P2025' ? 404 : 400 });
  }
}

export async function DELETE(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const parsed = z.object({ id: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Review not found.' }, { status: 400 });
  const existing = await db.review.findUnique({ where: { id: parsed.data.id }, select: { screenshotUrl: true, screenshotCloudinaryPublicId: true, screenshotLocalFileName: true } });
  if (existing) await removeReviewScreenshot(existing);
  await db.review.deleteMany({ where: { id: parsed.data.id } });
  return NextResponse.json({ ok: true });
}
