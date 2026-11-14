import Link from 'next/link';
import { db } from '@/lib/db';
import { WholesaleCatalog } from '@/components/wholesale-catalog';
import { money } from '@/lib/money';
import { safepayStatus } from '@/lib/payments/safepay';

export const dynamic = 'force-dynamic';

export default async function WholesalePage() {
  const [products, settings] = await Promise.all([
    db.product.findMany({ where: { active: true, wholesaleEnabled: true }, include: { category: true, variants: true }, orderBy: { name: 'asc' } }),
    db.storeSettings.upsert({ where: { id: 'store' }, update: {}, create: { id: 'store' } }),
  ]);
  const wholesalePrice = settings.wholesalePrice ?? 1000;
  const wholesaleMinimum = settings.wholesaleMinimum ?? 50;
  const wholesaleDeliveryFee = settings.wholesaleDeliveryFee ?? 850;
  const displayCurrency = settings.displayCurrency === 'USD' ? 'USD' : 'PKR';
  const usdToPkrRate = Number(settings.usdToPkrRate) || 280;
  const wholesaleDescription = settings.wholesaleDescription || 'Made from high-quality Adamjee Parkhel Cotton for a soft and comfortable feel. The overall design stays consistent across colours; embroidered bunch designs vary by colour. Choose your preferred colour and size. Finished with attention to quality and detail.';
  const gateway = safepayStatus();
  const internationalCheckoutReady = Boolean(settings.internationalShippingEnabled && gateway.cardPaymentsEnabled && gateway.cardPaymentEnvironment === 'production');
  return <main className="page-wrap wholesale-page">
    <div className="collection-title"><span className="eyebrow">AS COLLECTION · BULK ORDERS</span><h1>Wholesale collection</h1><p>Choose from the products marked for wholesale, select colours and sizes, then add at least {wholesaleMinimum} pieces to your bag.</p></div>
    <nav className="order-mode-switch" aria-label="Choose shopping type"><Link href="/collections/trousers">Retail shopping</Link><span className="selected">Wholesale orders</span></nav>
    <section id="wholesale-pricing" className="wholesale-intro"><div><span className="eyebrow">WHOLESALE RATES</span><h2>Product-wise pricing</h2><p>Each product shows its wholesale price per piece. Minimum order: {wholesaleMinimum} pieces in total. Wholesale delivery is {money(wholesaleDeliveryFee, displayCurrency, usdToPkrRate)} per order and is added at checkout.</p><p>Estimated Pakistan wholesale delivery: 12–15 days after order confirmation.</p>{internationalCheckoutReady && <p>International wholesale delivery: {settings.internationalDeliveryDays}; the fee is shown at checkout. Card payment is required.</p>}</div><p className="wholesale-description">{wholesaleDescription}</p></section>
    <WholesaleCatalog products={JSON.parse(JSON.stringify(products))} wholesalePrice={wholesalePrice} wholesaleMinimum={wholesaleMinimum}/>
  </main>;
}
