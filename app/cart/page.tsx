'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/components/cart-context';
import { useCurrency } from '@/components/currency-provider';
import { isPakistan, parseInternationalCountries } from '@/lib/shipping';

type PaymentMethod = 'COD' | 'CARD';
type Quote = {
  subtotal: number;
  discount: number;
  automaticDiscount?: number;
  shipping: number;
  total: number;
  couponApplied?: boolean;
  couponMessage?: string;
  wholesaleMinimumMet?: boolean;
  wholesaleQuantityRemaining?: number;
};

export default function CartPage() {
  const { items, remove, quantity, clear, purchaseType } = useCart();
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState('');
  const [address, setAddress] = useState(''), [city, setCity] = useState(''), [country, setCountry] = useState('Pakistan'), [coupon, setCoupon] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [error, setError] = useState(''), [order, setOrder] = useState(''), [completedType, setCompletedType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [whatsApp, setWhatsApp] = useState(''), [busy, setBusy] = useState(false);
  const [customerAccount, setCustomerAccount] = useState<any>(null);
  const [sessionStatus, setSessionStatus] = useState<'checking' | 'signed-in' | 'signed-out' | 'error'>('checking');
  const [settings, setSettings] = useState<any>({ codEnabled: true, cardPaymentsEnabled: false, deliveryFee: 250, freeDeliveryThreshold: 10000, wholesalePrice: 1000, wholesaleMinimum: 50, wholesaleUsdPriceCents: null });
  const { formatPrice } = useCurrency();
  const [quote, setQuote] = useState<Quote>({ subtotal: 0, discount: 0, shipping: 0, total: 0 });
  const requestKey = useRef('');
  const wholesaleQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const isWholesale = items.length > 0 && purchaseType === 'WHOLESALE';
  const wholesalePrice = Number(settings.wholesalePrice) || 1000;
  const wholesaleMinimum = Number(settings.wholesaleMinimum) || 50;
  const minimumRemaining = Math.max(0, wholesaleMinimum - wholesaleQuantity);
  const internationalCountries = settings.internationalShippingEnabled ? parseInternationalCountries(settings.internationalCountries) : [];
  const isInternational = !isPakistan(country);
  const internationalCheckoutReady = settings.internationalShippingEnabled && settings.cardPaymentsEnabled && settings.cardPaymentEnvironment === 'production' && Number.isInteger(settings.internationalDeliveryFeeUsdCents);

  useEffect(() => { fetch('/api/settings').then(response => response.json()).then(setSettings).catch(() => {}); }, []);
  useEffect(() => {
    try {
      sessionStorage.removeItem('as-abandoned-checkout-key');
      sessionStorage.removeItem('as-follow-up-whatsapp');
      sessionStorage.removeItem('as-follow-up-email');
    } catch {}
  }, []);
  useEffect(() => {
    fetch('/api/customer/session', { cache: 'no-store' }).then(async response => {
      const text = await response.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { throw new Error('Account service returned an invalid response.'); }
      if (!response.ok) throw new Error(data.error || `Account service failed (HTTP ${response.status}).`);
      const profile = data.customer;
      if (!profile) { setSessionStatus('signed-out'); return; }
      setCustomerAccount(profile);
      setName(value => value || profile.name || '');
      setEmail(value => value || profile.email || '');
      setPhone(value => value || profile.phone || '');
      setAddress(value => value || profile.address || '');
      setCity(value => value || profile.city || '');
      if (profile.country === 'Pakistan') setCountry('Pakistan');
      setSessionStatus('signed-in');
    }).catch(() => setSessionStatus('error'));
  }, []);
  useEffect(() => {
    if (!items.length) { setQuote({ subtotal: 0, discount: 0, shipping: 0, total: 0 }); setError(''); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/checkout/quote', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({
            purchaseType,
            paymentMethod,
            country,
            coupon: !isWholesale ? coupon.trim() || undefined : undefined,
            items: items.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, color: item.color, size: item.size })),
          }),
        });
        const data = await response.json();
        if (response.ok) { setQuote(data); setError(''); } else setError(data.error);
      } catch {
        if (!controller.signal.aborted) setError('Could not refresh basket pricing.');
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [items, coupon, purchaseType, isWholesale, paymentMethod, country]);

  async function checkout(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: requestKey.current, customerName: name, email, phone, address, city, country,
          paymentMethod, purchaseType,
          coupon: !isWholesale ? coupon.trim() || undefined : undefined,
          items: items.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, color: item.color, size: item.size, fitting: item.fitting, measurements: item.measurements })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (paymentMethod === 'CARD' && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      if (paymentMethod === 'CARD' && data.paymentStatus !== 'PAID') {
        throw new Error('Safepay did not confirm the checkout session. Please try again.');
      }
      setOrder(data.orderNumber); setCompletedType(purchaseType); setWhatsApp(data.whatsappUrl || ''); requestKey.current = '';
      clear();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Order could not be placed');
    } finally { setBusy(false); }
  }

  if (order) return <main className="page-wrap order-success"><span className="eyebrow">ORDER RECEIVED · {completedType}</span><h1>Thank you for choosing AS Collection.</h1><p>Your order reference is <strong>{order}</strong>. {paymentMethod === 'CARD' ? 'Your card payment has been confirmed.' : `Payment is due on delivery. ${completedType === 'WHOLESALE' ? `Wholesale prices are set per product; delivery is charged separately.` : ''}`} Our order record is in PKR. Our team will review your order details.</p>{whatsApp && <p><a className="button gold" href={whatsApp} target="_blank" rel="noopener noreferrer">Share order in WhatsApp</a><small className="whatsapp-note">WhatsApp opens with your order details. Please press Send in WhatsApp to send them to the store.</small></p>}<Link className="button dark" href="/">Continue shopping</Link></main>;

  return <main className="page-wrap">
    <div className="collection-title"><span className="eyebrow">YOUR SELECTION · {isWholesale ? 'WHOLESALE' : 'RETAIL'}</span><h1>Shopping bag</h1>
      {items.length > 0 && <p>{isWholesale ? `Product-wise wholesale prices · minimum ${wholesaleMinimum} pieces · delivery charged separately.` : 'Cash on Delivery is available. Pay when your order arrives.'}</p>}
    </div>
    {!items.length ? <div className="empty-state"><h3>Your bag is waiting for something special.</h3><p>Choose retail shopping or browse the wholesale collection.</p><Link className="button dark" href="/collections/new-arrivals">Shop retail</Link> <Link className="button outline" href="/wholesale">Shop wholesale</Link></div> :
      <div className="cart-layout"><section className="cart-lines">
        <div className="cart-actions"><span>{wholesaleQuantity} {isWholesale ? 'wholesale pieces' : 'retail items'}</span><button className="remove-link" type="button" onClick={clear}>Clear bag</button></div>
        {items.map(item => { const itemPrice = item.price; const usdItemPrice = item.usdPriceCents; return <article className="cart-line" key={item.key}><div className="cart-thumb">{item.image ? <img src={item.image} alt=""/> : <span>AS</span>}</div><div className="cart-info"><Link href={`/product/${item.slug}`}><h3>{item.name}</h3></Link><p>{[item.color, item.size, item.fitting === 'CUSTOM' ? 'Custom fit' : null].filter(Boolean).join(' · ')}</p>{item.measurements && <details><summary>Review measurements</summary><pre>{JSON.stringify(item.measurements, null, 2)}</pre></details>}<label>Qty <input type="number" min="1" max={isWholesale ? '10000' : '20'} value={item.quantity} onChange={event => quantity(item.key, Number(event.target.value))}/></label><button className="remove-link" type="button" onClick={() => remove(item.key)}>Remove</button></div><strong>{formatPrice(itemPrice * item.quantity, usdItemPrice == null ? null : usdItemPrice * item.quantity)}</strong></article>; })}
        {isWholesale && <div className={minimumRemaining ? 'minimum-note' : 'success-note'}>{minimumRemaining ? `Add ${minimumRemaining} more piece${minimumRemaining === 1 ? '' : 's'} to reach the ${wholesaleMinimum}-piece wholesale minimum.` : `${wholesaleMinimum}-piece wholesale minimum reached.`}</div>}
      </section>{sessionStatus === 'checking' ? <section className="checkout-card"><h2>Checking your account</h2><p>Please wait while we check your sign-in.</p></section>
        : sessionStatus === 'signed-out' ? <section className="checkout-card"><span className="eyebrow">ACCOUNT REQUIRED</span><h2>Create an account before checkout</h2><p>First create your account with your name, email, WhatsApp number, and password—or sign in. Your delivery form and order confirmation will appear after you sign in.</p><div className="checkout-auth-actions"><Link className="button dark" href="/account/register?returnTo=%2Fcart">Create account</Link><Link className="button outline" href="/account/login?returnTo=%2Fcart">Sign in</Link></div><p className="small-note">Your shopping bag will stay saved while you create your account or sign in.</p></section>
        : sessionStatus === 'error' ? <section className="checkout-card"><span className="eyebrow">ACCOUNT SERVICE</span><h2>We could not check your sign-in</h2><p>Please make sure the store is running and try again. Your basket is still saved.</p><button className="button outline" type="button" onClick={() => window.location.reload()}>Try again</button><p><Link href="/account/login?returnTo=%2Fcart">Go to sign in</Link></p></section>
        : <form className="checkout-card" onSubmit={checkout}><h2>Delivery details</h2>
        <div className="checkout-account-note"><p>Signed in as <strong>{customerAccount?.email}</strong> · <Link href="/account/profile">My account</Link></p></div>
        <label className="field-label">Full name<input required value={name} onChange={event => setName(event.target.value)}/></label>
        <label className="field-label">Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} readOnly={Boolean(customerAccount)}/></label>
        <label className="field-label">WhatsApp / phone<input required type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)}/></label>
        <label className="field-label">Address<textarea required value={address} onChange={event => setAddress(event.target.value)}/></label>
        <label className="field-label">City<input required value={city} onChange={event => setCity(event.target.value)}/></label>
        <label className="field-label">Country<select required value={country} onChange={event => { const nextCountry = event.target.value; setCountry(nextCountry); setPaymentMethod(isPakistan(nextCountry) ? 'COD' : 'CARD'); }}><option value="Pakistan">Pakistan</option>{internationalCountries.map((value: string) => <option key={value} value={value}>{value}</option>)}</select></label>
        <p className="small-note">{isInternational ? `Estimated international delivery: ${settings.internationalDeliveryDays || '12–15 days'} after order confirmation. International orders require card payment; Cash on Delivery is unavailable.` : isWholesale ? 'Estimated Pakistan wholesale delivery: 12–15 days after order confirmation.' : 'Estimated Pakistan retail delivery: 4–6 days after order confirmation.'}</p>
        <fieldset className="payment-options"><legend>Payment method</legend>
          {!isInternational && <label><input type="radio" name="paymentMethod" value="COD" checked={paymentMethod === 'COD'} onChange={() => setPaymentMethod('COD')} disabled={!settings.codEnabled}/> Cash on Delivery <span>Pay when your order arrives</span></label>}
          {(settings.cardPaymentsEnabled || isInternational) && <label><input type="radio" name="paymentMethod" value="CARD" checked={paymentMethod === 'CARD'} onChange={() => setPaymentMethod('CARD')} disabled={!settings.cardPaymentsEnabled}/> Card payment <span>{settings.cardPaymentsEnabled ? '5% card discount' : 'Unavailable until the card gateway is approved and configured'}</span></label>}
        </fieldset>
        {isInternational && !internationalCheckoutReady && <p className="error-note">International checkout is not ready yet. The store must enable this destination and configure an approved card gateway before an international order can be placed.</p>}
        {!isWholesale && <label className="field-label">Coupon code<input value={coupon} onChange={event => setCoupon(event.target.value.toUpperCase())} onBlur={() => setCoupon(value => value.trim())}/></label>}
        {quote.couponMessage && <p className={quote.couponApplied ? 'success-note' : 'error-note'}>{quote.couponMessage}</p>}
        <div className="totals"><p><span>Subtotal</span><strong>{formatPrice(quote.subtotal)}</strong></p>
          {quote.discount > 0 && <p><span>Discount</span><strong>−{formatPrice(quote.discount)}</strong></p>}
          <p><span>Delivery</span><strong>{quote.shipping ? formatPrice(quote.shipping) : 'Complimentary'}</strong></p>
          <p className="grand-total"><span>Total</span><strong>{formatPrice(quote.total)}</strong></p>
        </div>
        {isWholesale && <p className="small-note">Wholesale price excludes delivery charges. Delivery is added above.</p>}
        {paymentMethod === 'COD' && !settings.codEnabled && <p className="error-note">Cash on Delivery is currently unavailable. Please contact the store.</p>}
        {error && <p className="error-note">{error}</p>}
        <button className="button dark wide" disabled={busy || (paymentMethod === 'COD' && (!settings.codEnabled || isInternational)) || (paymentMethod === 'CARD' && !settings.cardPaymentsEnabled) || (isInternational && !internationalCheckoutReady) || (isWholesale && minimumRemaining > 0)}>{busy ? (paymentMethod === 'CARD' ? 'Opening card checkout…' : 'Placing order…') : isWholesale && minimumRemaining > 0 ? `Add ${minimumRemaining} more pieces` : paymentMethod === 'CARD' ? 'Pay by card · 5% off' : 'Place Cash on Delivery order'}</button>
        <p className="checkout-policy-links">By placing an order, you acknowledge our <Link href="/policies/terms">Terms</Link>, <Link href="/policies/shipping">Shipping</Link>, <Link href="/policies/returns">Returns</Link>, and <Link href="/policies/privacy">Privacy</Link> policies.</p>
        <small>Prices, offers, delivery and stock are checked again securely when placing your order.</small>
      </form>}</div>}
  </main>;
}
