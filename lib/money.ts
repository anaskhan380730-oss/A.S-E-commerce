export type DisplayCurrency = 'PKR' | 'USD';

export function money(amountPkr: number, currency: DisplayCurrency = 'PKR', usdToPkrRate = 280, usdPriceCents?: number | null) {
  if (currency === 'USD') {
    const rate = Number.isFinite(usdToPkrRate) && usdToPkrRate > 0 ? usdToPkrRate : 280;
    const dollars = usdPriceCents == null ? amountPkr / rate : usdPriceCents / 100;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(dollars);
  }
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amountPkr);
}

export function priceInPkr(amountPkr: number, currency: DisplayCurrency, usdToPkrRate: number, usdPriceCents?: number | null) {
  if (currency === 'USD' && usdPriceCents != null) return Math.round((usdPriceCents / 100) * usdToPkrRate);
  return amountPkr;
}
export function calculateTotals(lines: { unitPrice: number; quantity: number }[], shippingFee = 250, freeShippingThreshold = 10000) {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const shipping = subtotal === 0 || subtotal >= freeShippingThreshold ? 0 : shippingFee;
  return { subtotal, shipping, total: subtotal + shipping };
}
