import { db } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ProductDetails } from '@/components/product-details';
import type { ProductDetailsRecord } from '@/lib/storefront-types';
import { parseInternationalCountries } from '@/lib/shipping';
import { safepayStatus } from '@/lib/payments/safepay';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([
    db.product.findUnique({ where: { slug, active: true }, include: { category: true, variants: true } }),
    db.storeSettings.findUnique({ where: { id: 'store' } }),
  ]);
  if (!product) notFound();

  const gateway = safepayStatus();
  const internationalCountries = parseInternationalCountries(settings?.internationalCountries).join(', ');
  const internationalCheckoutReady = Boolean(settings?.internationalShippingEnabled && internationalCountries && gateway.cardPaymentsEnabled && gateway.cardPaymentEnvironment === 'production');

  return <ProductDetails
    product={JSON.parse(JSON.stringify(product)) as ProductDetailsRecord}
    customStitchingEnabled={settings?.customStitchingEnabled ?? true}
    deliveryFee={settings?.deliveryFee ?? 250}
    deliveryFeeUsdCents={settings?.deliveryFeeUsdCents ?? null}
    freeDeliveryThreshold={settings?.freeDeliveryThreshold ?? 10000}
    freeDeliveryThresholdUsdCents={settings?.freeDeliveryThresholdUsdCents ?? null}
    internationalCountries={internationalCountries}
    internationalDeliveryDays={settings?.internationalDeliveryDays ?? '12–15 days'}
    internationalCheckoutReady={internationalCheckoutReady}
  />;
}
