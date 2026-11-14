import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { calculatePromotions, type PriceLine } from '@/lib/commerce';
import { money, priceInPkr, type DisplayCurrency } from '@/lib/money';
import { safepayStatus } from '@/lib/payments/safepay';
import { internationalShippingError, isPakistan } from '@/lib/shipping';

const schema = z.object({
  purchaseType: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  paymentMethod: z.enum(['COD', 'CARD']).default('COD'),
  country: z.string().trim().min(2).max(100).default('Pakistan'),
  coupon: z.string().max(40).optional(),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    quantity: z.number().int().min(1).max(10000),
    color: z.string().optional(),
    size: z.string().optional(),
  })).min(1).max(30),
}).superRefine((value, ctx) => {
  if (value.purchaseType === 'RETAIL' && value.items.some(item => item.quantity > 20)) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'Retail orders allow up to 20 of each option.' });
  }
  if (value.purchaseType === 'WHOLESALE' && value.coupon) {
    ctx.addIssue({ code: 'custom', path: ['coupon'], message: 'Coupon codes cannot be used on wholesale orders.' });
  }
});

export async function POST(req: Request) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid basket.' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid basket.' }, { status: 400 });
  const input = parsed.data;
  const gateway = safepayStatus();
  const settings = await db.storeSettings.upsert({ where: { id: 'store' }, update: {}, create: { id: 'store' } });
  const shippingError = internationalShippingError(input.country, settings);
  if (shippingError) return NextResponse.json({ error: shippingError }, { status: 400 });
  if (!isPakistan(input.country) && input.paymentMethod !== 'CARD') {
    return NextResponse.json({ error: 'International orders require card payment. Cash on Delivery is only available in Pakistan.' }, { status: 400 });
  }
  if (!isPakistan(input.country) && (!gateway.cardPaymentsEnabled || gateway.cardPaymentEnvironment !== 'production')) {
    return NextResponse.json({ error: 'International checkout is unavailable until the live card gateway is approved and configured.' }, { status: 503 });
  }
  if (input.paymentMethod === 'CARD' && !gateway.cardPaymentsEnabled) {
    return NextResponse.json({ error: isPakistan(input.country) ? 'Card payments are currently unavailable. Please choose Cash on Delivery.' : 'International delivery is configured, but card payments are not ready yet. Please contact the store.' }, { status: 503 });
  }
  const products = await db.product.findMany({
    where: { id: { in: [...new Set(input.items.map(item => item.productId))] }, active: true },
    include: { variants: true },
  });
  if (products.length !== new Set(input.items.map(item => item.productId)).size) {
    return NextResponse.json({ error: 'A product is no longer available.' }, { status: 409 });
  }
  if (input.purchaseType === 'WHOLESALE') {
    const unavailable = products.find(product => !product.wholesaleEnabled);
    if (unavailable) return NextResponse.json({ error: `${unavailable.name} is not currently available for wholesale.` }, { status: 409 });
  }

  for (const item of input.items) {
    const product = products.find(candidate => candidate.id === item.productId)!;
    const variant = product.variants.find(candidate => candidate.active && candidate.id === item.variantId)
      || product.variants.find(candidate => candidate.active && candidate.color === item.color && candidate.size === item.size);
    if (!variant || variant.stock < item.quantity) {
      return NextResponse.json({ error: `${product.name} is no longer available in this quantity.` }, { status: 409 });
    }
  }

  const allPromotions = input.purchaseType === 'RETAIL'
    ? await db.promotion.findMany({ where: { active: true, OR: [{ code: null }, { code: input.coupon?.toUpperCase() || '__NO_MATCH__' }] } })
    : [];
  const promotions = isPakistan(input.country) ? allPromotions : allPromotions.filter(promotion => promotion.type !== 'FREE_SHIPPING');
  const wholesalePrice = settings.wholesalePrice ?? 1000;
  const wholesaleMinimum = settings.wholesaleMinimum ?? 50;
  const wholesaleDeliveryFee = settings.wholesaleDeliveryFee ?? 850;
  const currency: DisplayCurrency = settings.displayCurrency === 'USD' ? 'USD' : 'PKR';
  const exchangeRate = Number(settings.usdToPkrRate) || 280;
  const deliveryFeePkr = isPakistan(input.country)
    ? priceInPkr(settings.deliveryFee, currency, exchangeRate, settings.deliveryFeeUsdCents)
    : priceInPkr(0, 'USD', exchangeRate, settings.internationalDeliveryFeeUsdCents);
  const freeDeliveryThresholdPkr = isPakistan(input.country)
    ? priceInPkr(settings.freeDeliveryThreshold, currency, exchangeRate, settings.freeDeliveryThresholdUsdCents)
    : Number.MAX_SAFE_INTEGER;
  const priceLines: PriceLine[] = input.items.map(item => {
    const product = products.find(candidate => candidate.id === item.productId)!;
    return {
      productId: product.id,
      categoryId: product.categoryId,
      unitPrice: input.purchaseType === 'WHOLESALE'
        ? priceInPkr(product.wholesalePrice ?? wholesalePrice, currency, exchangeRate, product.wholesalePriceUsdCents ?? settings.wholesaleUsdPriceCents)
        : priceInPkr(product.price, currency, exchangeRate, product.priceUsdCents),
      quantity: item.quantity,
    };
  });
  const calculated = calculatePromotions(
    priceLines,
    promotions,
    input.coupon,
    deliveryFeePkr,
    freeDeliveryThresholdPkr,
    undefined,
    input.paymentMethod === 'CARD' ? 5 : 0,
  );
  const totals = input.purchaseType === 'WHOLESALE'
    ? { ...calculated, shipping: isPakistan(input.country) ? wholesaleDeliveryFee : deliveryFeePkr, total: calculated.subtotal - calculated.discount + (isPakistan(input.country) ? wholesaleDeliveryFee : deliveryFeePkr), appliedPromotionIds: [] }
    : calculated;

  const couponPromotion = allPromotions.find(promotion => promotion.code?.toUpperCase() === input.coupon?.toUpperCase());
  const couponApplied = !!couponPromotion && totals.appliedPromotionIds.includes(couponPromotion.id);
  let couponMessage = '';
  if (input.coupon && !couponPromotion) couponMessage = 'Coupon code was not found or is inactive.';
  else if (input.coupon && couponPromotion && !couponApplied) {
    couponMessage = couponPromotion.minimumOrder && totals.subtotal < couponPromotion.minimumOrder
      ? `Add ${money(couponPromotion.minimumOrder - totals.subtotal, currency, exchangeRate)} to meet this offer's minimum.`
      : 'This offer does not apply to the selected items.';
  } else if (couponApplied) couponMessage = 'Offer applied.';

  const wholesaleQuantity = input.items.reduce((sum, item) => sum + item.quantity, 0);
  return NextResponse.json({
    ...totals,
    cardDiscount: input.paymentMethod === 'CARD' ? totals.automaticDiscount : 0,
    cardPaymentsEnabled: gateway.cardPaymentsEnabled,
    couponApplied,
    couponMessage,
    wholesaleMinimumMet: input.purchaseType !== 'WHOLESALE' || wholesaleQuantity >= wholesaleMinimum,
    wholesaleQuantityRemaining: input.purchaseType === 'WHOLESALE' ? Math.max(0, wholesaleMinimum - wholesaleQuantity) : 0,
  });
}
