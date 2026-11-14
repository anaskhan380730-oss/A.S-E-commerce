import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safepayStatus } from '@/lib/payments/safepay';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await db.storeSettings.upsert({ where: { id: 'store' }, update: {}, create: { id: 'store' } });
  return NextResponse.json({
    deliveryFee: settings.deliveryFee,
    deliveryFeeUsdCents: settings.deliveryFeeUsdCents,
    freeDeliveryThreshold: settings.freeDeliveryThreshold,
    freeDeliveryThresholdUsdCents: settings.freeDeliveryThresholdUsdCents,
    internationalShippingEnabled: settings.internationalShippingEnabled,
    internationalDeliveryFeeUsdCents: settings.internationalDeliveryFeeUsdCents,
    internationalCountries: settings.internationalCountries,
    internationalDeliveryDays: settings.internationalDeliveryDays,
    codEnabled: settings.codEnabled,
    customStitchingEnabled: settings.customStitchingEnabled,
    whatsappNumber: settings.whatsappNumber,
    storeName: settings.storeName,
    wholesalePrice: settings.wholesalePrice ?? 1000,
    wholesaleMinimum: settings.wholesaleMinimum ?? 50,
    wholesaleDeliveryFee: settings.wholesaleDeliveryFee ?? 850,
    wholesaleDescription: settings.wholesaleDescription || 'Made from high-quality Adamjee Parkhel Cotton for a soft and comfortable feel. The overall design stays consistent across colours; embroidered bunch designs vary by colour. Choose your preferred colour and size. Finished with attention to quality and detail.',
    displayCurrency: settings.displayCurrency === 'USD' ? 'USD' : 'PKR',
    usdToPkrRate: Number(settings.usdToPkrRate) || 280,
    wholesaleUsdPriceCents: settings.wholesaleUsdPriceCents,
    ...safepayStatus(),
  });
}
