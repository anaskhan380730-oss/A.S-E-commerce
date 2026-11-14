import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { policyContent } from '@/lib/policy-content';

const schema = z.object({
  shippingPolicy: z.string().trim().min(30).max(12000),
  returnsPolicy: z.string().trim().min(30).max(12000),
  privacyPolicy: z.string().trim().min(30).max(12000),
  termsPolicy: z.string().trim().min(30).max(12000),
});

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const settings = await db.storeSettings.upsert({ where: { id: 'store' }, update: {}, create: { id: 'store' } });
  return NextResponse.json({
    shippingPolicy: policyContent('shippingPolicy', settings.shippingPolicy),
    returnsPolicy: policyContent('returnsPolicy', settings.returnsPolicy),
    privacyPolicy: policyContent('privacyPolicy', settings.privacyPolicy),
    termsPolicy: policyContent('termsPolicy', settings.termsPolicy),
  });
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid policy request.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Each policy needs at least 30 characters and must be under 12,000 characters.' }, { status: 400 });

  try {
    const settings = await db.storeSettings.upsert({ where: { id: 'store' }, update: parsed.data, create: { id: 'store', ...parsed.data } });
    return NextResponse.json({
      shippingPolicy: settings.shippingPolicy,
      returnsPolicy: settings.returnsPolicy,
      privacyPolicy: settings.privacyPolicy,
      termsPolicy: settings.termsPolicy,
    });
  } catch (error) {
    console.error('Store policy update failed:', error);
    return NextResponse.json({ error: 'Could not save policies. Confirm the database migration has been applied.' }, { status: 500 });
  }
}
