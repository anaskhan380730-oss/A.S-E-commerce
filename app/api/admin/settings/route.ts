import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { z } from 'zod';
import { safepayStatus } from '@/lib/payments/safepay';
import { parseInternationalCountries } from '@/lib/shipping';

const schema = z.object({
  deliveryFee: z.number().int().min(0).max(100000),
  deliveryFeeUsdCents: z.number().int().min(0).max(100000000).nullable(),
  freeDeliveryThreshold: z.number().int().min(0).max(10000000),
  freeDeliveryThresholdUsdCents: z.number().int().min(0).max(1000000000).nullable(),
  internationalShippingEnabled: z.boolean(),
  internationalDeliveryFeeUsdCents: z.number().int().min(0).max(100000000).nullable(),
  internationalCountries: z.string().max(1000),
  internationalDeliveryDays: z.string().trim().min(2).max(50),
  codEnabled: z.boolean(),
  customStitchingEnabled: z.boolean(),
  whatsappNumber: z.string().regex(/^\+?\d{7,20}$/).or(z.literal('')),
  storeName: z.string().min(2).max(80),
  wholesalePrice: z.number().int().min(1).max(10000000),
  wholesaleMinimum: z.number().int().min(1).max(100000),
  wholesaleDeliveryFee: z.number().int().min(850).max(1000),
  wholesaleDescription: z.string().min(10).max(5000),
  displayCurrency: z.enum(['PKR', 'USD']),
  usdToPkrRate: z.number().min(1).max(100000),
  wholesaleUsdPriceCents: z.number().int().positive().max(100000000).nullable(),
}).superRefine((settings, context) => {
  if (!settings.internationalShippingEnabled) return;
  if (settings.internationalDeliveryFeeUsdCents === null) {
    context.addIssue({ code: 'custom', path: ['internationalDeliveryFeeUsdCents'], message: 'Set an international delivery fee before enabling international delivery.' });
  }
  if (!parseInternationalCountries(settings.internationalCountries).length) {
    context.addIssue({ code: 'custom', path: ['internationalCountries'], message: 'Add at least one supported country before enabling international delivery.' });
  }
});

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const settings = await db.storeSettings.upsert({ where: { id: 'store' }, update: {}, create: { id: 'store' } });
  return NextResponse.json({ ...settings, ...safepayStatus() });
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid settings request.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.internationalShippingEnabled) {
    const gateway = safepayStatus();
    if (!gateway.cardPaymentsEnabled || gateway.cardPaymentEnvironment !== 'production') {
      return NextResponse.json({ error: 'International delivery can only be enabled after the live card gateway is approved and configured. You can save countries and delivery pricing while the switch is off.' }, { status: 400 });
    }
  }
  try {
    const settings = await db.storeSettings.upsert({ where: { id: 'store' }, update: parsed.data, create: { id: 'store', ...parsed.data } });
    return NextResponse.json({ ...settings, ...safepayStatus() });
  } catch (error) {
    console.error('Admin settings update failed:', error);
    return NextResponse.json({ error: 'Could not save settings. Check the VS Code terminal for the database error, then restart the dev server.' }, { status: 500 });
  }
}
