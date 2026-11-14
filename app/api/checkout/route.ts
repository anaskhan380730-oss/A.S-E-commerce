import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkoutSchema } from '@/lib/validators';
import { calculatePromotions, type PriceLine } from '@/lib/commerce';
import { priceInPkr, type DisplayCurrency } from '@/lib/money';
import { measurementGroups } from '@/lib/measurements';
import { assertSafepayReady, createSafepayCheckoutUrl, createSafepayTracker, safepayStatus } from '@/lib/payments/safepay';
import { internationalShippingError, isPakistan } from '@/lib/shipping';
import { getCustomer } from '@/lib/auth';

function toCurrencyMinor(amountPkr: number, currency: DisplayCurrency, exchangeRate: number) {
  return currency === 'USD' ? Math.round(amountPkr / exchangeRate * 100) : amountPkr;
}

function orderMessage(order: any, number: string, whatsapp: string) {
  const items = order.items.map((item: any) =>
    `${item.productName} × ${item.quantity} | PKR ${item.unitPrice}/piece${item.color ? ` | ${item.color}` : ''}${item.size ? ` | ${item.size}` : ''}${item.fitting === 'CUSTOM' ? ` | Custom measurements: ${JSON.stringify(item.measurements)}` : ''}`,
  ).join('\n');
  const message = [
    `AS Collection ${order.orderType === 'WHOLESALE' ? 'wholesale' : 'retail'} order ${number}`,
    `Customer: ${order.customerName}`,
    `Phone: ${order.phone}`,
    `Address: ${order.address}, ${order.city}, ${order.country}`,
    '', items, '',
    `Order currency: ${order.orderCurrency} ${order.orderCurrency === 'USD' ? (order.orderCurrencyTotal / 100).toFixed(2) : order.orderCurrencyTotal}`,
    `Discount: PKR ${order.discount}`,
    `Delivery: PKR ${order.shipping}`,
    `Total: PKR ${order.total}`,
    `Payment: ${order.paymentMethod}`,
  ].join('\n');
  return whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
    : null;
}

function responseForOrder(order: any, whatsapp: string, status = 200) {
  return NextResponse.json({
    ok: true,
    orderNumber: order.number,
    total: order.total,
    discount: order.discount,
    shipping: order.shipping,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    whatsappUrl: orderMessage(order, order.number, whatsapp),
  }, { status });
}

async function releaseUnlinkedCardOrder(orderId: string) {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.paymentMethod !== 'CARD' || order.paymentStatus !== 'UNPAID' || order.providerReference || order.status !== 'PENDING') return;
    for (const item of order.items) {
      if (!item.variantId) continue;
      await tx.variant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
    }
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', paymentStatus: 'FAILED' } });
  });
}

export async function POST(req: Request) {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Please review your details and cart.' }, { status: 400 });
  const input = parsed.data;
  const signedInCustomer = await getCustomer();
  if (!signedInCustomer) {
    return NextResponse.json({ error: 'Please create an account or sign in before entering delivery details and placing an order.' }, { status: 401 });
  }
  if (signedInCustomer && signedInCustomer.email !== input.email.trim().toLowerCase()) {
    return NextResponse.json({ error: `You are signed in as ${signedInCustomer.email}. Use that email for this order.` }, { status: 400 });
  }

  const domesticOrder = isPakistan(input.country);
  if (!domesticOrder && input.paymentMethod !== 'CARD') {
    return NextResponse.json({ error: 'International orders require card payment. Cash on Delivery is only available in Pakistan.' }, { status: 400 });
  }
  const gatewayStatus = safepayStatus();
  if (!domesticOrder && (!gatewayStatus.cardPaymentsEnabled || gatewayStatus.cardPaymentEnvironment !== 'production')) {
    return NextResponse.json({ error: 'International checkout is unavailable until the live card gateway is approved and configured.' }, { status: 503 });
  }

  const preflightSettings = await db.storeSettings.upsert({ where: { id: 'store' }, update: {}, create: { id: 'store' } });
  const shippingError = internationalShippingError(input.country, preflightSettings);
  if (shippingError) return NextResponse.json({ error: shippingError }, { status: 400 });

  if (input.paymentMethod === 'CARD') {
    try { assertSafepayReady(); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Card checkout is not configured.' }, { status: 503 }); }
  }

  let createdOrderId: string | null = null;
  try {
    const result = await db.$transaction(async (tx) => {
      const prior = await tx.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
      if (prior) {
        if (prior.paymentMethod !== input.paymentMethod) throw new Error('This checkout request was already used with a different payment method. Refresh the page and try again.');
        return { order: prior, whatsapp: prior.whatsappNumber || '', created: false };
      }

      const settings = await tx.storeSettings.upsert({ where: { id: 'store' }, update: {}, create: { id: 'store' } });
      const currentShippingError = internationalShippingError(input.country, settings);
      if (currentShippingError) throw new Error(currentShippingError);
      if (!isPakistan(input.country) && input.paymentMethod !== 'CARD') throw new Error('International orders require card payment. Cash on Delivery is only available in Pakistan.');
      if (input.paymentMethod === 'COD' && !settings.codEnabled) throw new Error('Cash on Delivery is currently unavailable.');
      const wholesaleQuantity = input.items.reduce((sum, item) => sum + item.quantity, 0);
      const wholesaleMinimum = settings.wholesaleMinimum ?? 50;
      const wholesalePrice = settings.wholesalePrice ?? 1000;
      const wholesaleDeliveryFee = settings.wholesaleDeliveryFee ?? 850;
      const currency: DisplayCurrency = settings.displayCurrency === 'USD' ? 'USD' : 'PKR';
      const exchangeRate = Number(settings.usdToPkrRate) || 280;
      const deliveryFeePkr = domesticOrder
        ? priceInPkr(settings.deliveryFee, currency, exchangeRate, settings.deliveryFeeUsdCents)
        : priceInPkr(0, 'USD', exchangeRate, settings.internationalDeliveryFeeUsdCents);
      const freeDeliveryThresholdPkr = domesticOrder
        ? priceInPkr(settings.freeDeliveryThreshold, currency, exchangeRate, settings.freeDeliveryThresholdUsdCents)
        : Number.MAX_SAFE_INTEGER;
      if (input.purchaseType === 'WHOLESALE' && wholesaleQuantity < wholesaleMinimum) {
        throw new Error(`Wholesale orders require at least ${wholesaleMinimum} pieces. Add ${wholesaleMinimum - wholesaleQuantity} more.`);
      }
      const ids = [...new Set(input.items.map((item) => item.productId))];
      const products = await tx.product.findMany({ where: { id: { in: ids }, active: true }, include: { variants: true, category: true } });
      if (products.length !== ids.length) throw new Error('A product is no longer available.');
      if (input.purchaseType === 'WHOLESALE') {
        const unavailable = products.find((product) => !product.wholesaleEnabled);
        if (unavailable) throw new Error(`${unavailable.name} is not currently available for wholesale.`);
      }

      const rows = input.items.map((line) => {
        const product = products.find((candidate) => candidate.id === line.productId)!;
        const variant = product.variants.find((candidate) => candidate.active && candidate.id === line.variantId)
          || product.variants.find((candidate) => candidate.active && candidate.color === line.color && candidate.size === line.size);
        if (!variant || variant.stock < line.quantity) throw new Error(`${product.name} is out of stock in the selected option.`);

        const customEnabled = settings.customStitchingEnabled && (product.customMeasurements ?? product.category.customMeasurements);
        if (line.fitting === 'CUSTOM') {
          if (input.purchaseType === 'WHOLESALE') throw new Error('Custom stitching is currently available on retail orders only.');
          if (!customEnabled || !line.measurements) throw new Error(`Custom stitching is unavailable for ${product.name}.`);
          const definitions = measurementGroups(product.category.measurementFields, product.category.slug).flatMap((group) => group.fields);
          if (!definitions.length) throw new Error(`No measurement template is configured for ${product.name}.`);
          for (const field of definitions) {
            const value = line.measurements[field.key];
            if (field.required && (value === undefined || value === '')) throw new Error(`Enter ${field.label} for ${product.name}.`);
            if (value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < field.min || Number(value) > field.max)) {
              throw new Error(`${field.label} for ${product.name} must be between ${field.min} and ${field.max}.`);
            }
          }
          const allowed = new Set([...definitions.map((field) => field.key), 'unit', 'notes']);
          if (Object.keys(line.measurements).some((key) => !allowed.has(key))) throw new Error(`Unexpected measurement field for ${product.name}.`);
          if (!['in', 'cm'].includes(String(line.measurements.unit || ''))) throw new Error(`Select inches or centimeters for ${product.name}.`);
        }
        const unitPrice = input.purchaseType === 'WHOLESALE'
          ? priceInPkr(product.wholesalePrice ?? wholesalePrice, currency, exchangeRate, product.wholesalePriceUsdCents ?? settings.wholesaleUsdPriceCents)
          : priceInPkr(product.price, currency, exchangeRate, product.priceUsdCents);
        return { line, product, variant, unitPrice };
      });

      const priceLines: PriceLine[] = rows.map(({ line, product, unitPrice }) => ({
        productId: product.id, categoryId: product.categoryId, unitPrice, quantity: line.quantity,
      }));
      const availablePromotions = input.purchaseType === 'RETAIL'
        ? await tx.promotion.findMany({ where: { active: true, OR: [{ code: null }, { code: input.coupon?.toUpperCase() || '__NO_MATCH__' }] } })
        : [];
      const promotions = domesticOrder ? availablePromotions : availablePromotions.filter(promotion => promotion.type !== 'FREE_SHIPPING');
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
        ? { ...calculated, shipping: domesticOrder ? wholesaleDeliveryFee : deliveryFeePkr, total: calculated.subtotal - calculated.discount + (domesticOrder ? wholesaleDeliveryFee : deliveryFeePkr), appliedPromotionIds: [] }
        : calculated;

      const usedPromotions = promotions.filter((promotion) => totals.appliedPromotionIds.includes(promotion.id));
      for (const promotion of usedPromotions) {
        const updated = await tx.promotion.updateMany({
          where: { id: promotion.id, useCount: promotion.useCount, ...(promotion.maxUses === null ? {} : { maxUses: { gte: promotion.useCount + 1 } }) },
          data: { useCount: { increment: 1 } },
        });
        if (!updated.count) throw new Error('That offer has just reached its use limit. Please review your basket.');
      }

      const number = `ASC-${Date.now().toString(36).toUpperCase()}-${input.idempotencyKey.toUpperCase()}`;
      const custom = rows.some((row) => row.line.fitting === 'CUSTOM');
      if (signedInCustomer) {
        await tx.customer.update({
          where: { id: signedInCustomer.id },
          data: { name: input.customerName, phone: input.phone, address: input.address, city: input.city, country: input.country.trim() },
        });
      }
      const order = await tx.order.create({
        data: {
          number,
          idempotencyKey: input.idempotencyKey,
          orderType: input.purchaseType,
          customerName: input.customerName,
          customerId: signedInCustomer?.id,
          email: input.email.toLowerCase(),
          phone: input.phone,
          address: input.address,
          city: input.city,
          country: input.country.trim(),
          orderCurrency: currency,
          orderCurrencyRate: exchangeRate,
          orderCurrencySubtotal: toCurrencyMinor(totals.subtotal, currency, exchangeRate),
          orderCurrencyShipping: toCurrencyMinor(totals.shipping, currency, exchangeRate),
          orderCurrencyDiscount: toCurrencyMinor(totals.discount, currency, exchangeRate),
          orderCurrencyTotal: toCurrencyMinor(totals.total, currency, exchangeRate),
          subtotal: totals.subtotal,
          shipping: totals.shipping,
          discount: totals.discount,
          total: totals.total,
          paymentMethod: input.paymentMethod,
          paymentStatus: 'UNPAID',
          stitchingStatus: custom ? 'NEEDS_REVIEW' : 'NOT_REQUIRED',
          whatsappNumber: settings.whatsappNumber,
          items: { create: rows.map(({ line, product, variant, unitPrice }, index) => ({
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            unitPrice,
            quantity: line.quantity,
            lineDiscount: totals.lineDiscounts[index],
            color: line.color,
            size: line.size,
            fitting: line.fitting,
            measurements: line.measurements ?? undefined,
          })) },
        },
        include: { items: true },
      });
      createdOrderId = order.id;

      for (const { line, variant } of rows) {
        const updated = await tx.variant.updateMany({ where: { id: variant.id, stock: { gte: line.quantity } }, data: { stock: { decrement: line.quantity } } });
        if (updated.count !== 1) throw new Error('Stock changed during checkout. Please try again.');
      }
      return { order, whatsapp: settings.whatsappNumber, created: true };
    }, { isolationLevel: 'Serializable' });

    if (result.order.paymentMethod === 'COD') return responseForOrder(result.order, result.whatsapp, result.created ? 201 : 200);
    if (result.order.status === 'CANCELLED' || result.order.paymentStatus === 'FAILED') {
      return NextResponse.json({ error: 'This card payment attempt was cancelled. Please refresh the basket and start again.' }, { status: 409 });
    }
    if (result.order.paymentStatus === 'PAID') return responseForOrder(result.order, result.whatsapp, 200);

    let tracker = result.order.providerReference;
    if (!tracker) {
      tracker = await createSafepayTracker(result.order.number, result.order.total);
      await db.order.update({ where: { id: result.order.id }, data: { providerReference: tracker } });
    }
    const checkoutUrl = await createSafepayCheckoutUrl(tracker, result.order.number);
    return NextResponse.json({
      ok: true,
      orderNumber: result.order.number,
      total: result.order.total,
      discount: result.order.discount,
      shipping: result.order.shipping,
      paymentMethod: 'CARD',
      paymentStatus: result.order.paymentStatus,
      checkoutUrl,
    }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (createdOrderId) {
      try { await releaseUnlinkedCardOrder(createdOrderId); }
      catch { /* Preserve the original checkout error; an administrator can review the pending order. */ }
    }
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
    if (code === 'P2002') {
      const prior = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
      if (prior && prior.paymentMethod === input.paymentMethod && prior.paymentMethod === 'COD') {
        return responseForOrder(prior, prior.whatsappNumber || '', 200);
      }
      if (prior && prior.paymentMethod === input.paymentMethod && prior.paymentMethod === 'CARD' && prior.providerReference) {
        try {
          const checkoutUrl = await createSafepayCheckoutUrl(prior.providerReference, prior.number);
          return NextResponse.json({ ok: true, orderNumber: prior.number, checkoutUrl, paymentMethod: 'CARD', paymentStatus: prior.paymentStatus }, { status: 200 });
        } catch { /* Return the safe general conflict response below. */ }
      }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Checkout failed.' }, { status: 409 });
  }
}
