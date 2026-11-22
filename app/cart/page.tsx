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
  shipping: number;
  total: number;
  couponApplied?: boolean;
  couponMessage?: string;
};

function checkoutSessionKey() {
  try {
    const existing = sessionStorage.getItem('as-checkout-session');
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem('as-checkout-session', created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export default function CartPage() {
  const { items, remove, quantity, clear, purchaseType } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Pakistan');
  const [coupon, setCoupon] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [error, setError] = useState('');
  const [order, setOrder] = useState('');
  const [completedType, setCompletedType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [whatsApp, setWhatsApp] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [settings, setSettings] = useState<any>({
    codEnabled: true, cardPaymentsEnabled: false, deliveryFee: 250, freeDeliveryThreshold: 10000,
    wholesaleMinimum: 50, internationalShippingEnabled: false, internationalCountries: '', internationalDeliveryDays: '12–15 days',
  });
  const { formatPrice } = useCurrency();
  const [quote, setQuote] = useState<Quote>({ subtotal: 0, discount: 0, shipping: 0, total: 0 });
  const requestKey = useRef('');
  const sessionKey = useRef('');
  const wholesaleQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const isWholesale = items.length > 0 && purchaseType === 'WHOLESALE';
  const wholesaleMinimum = Number(settings.wholesaleMinimum) || 50;
  const minimumRemaining = Math.max(0, wholesaleMinimum - wholesaleQuantity);
  const internationalCountries = settings.internationalShippingEnabled ? parseInternationalCountries(settings.internationalCountries) : [];
  const isInternational = !isPakistan(country);
  const internationalCheckoutReady = settings.internationalShippingEnabled && settings.cardPaymentsEnabled && settings.cardPaymentEnvironment === 'production' && Number.isInteger(settings.internationalDeliveryFeeUsdCents);

  useEffect(() => {
    sessionKey.current = checkoutSessionKey();
    fetch('/api/settings').then(response => response.json()).then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!items.length) { setQuote({ subtotal: 0, discount: 0, shipping: 0, total: 0 }); setError(''); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/checkout/quote', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({
            purchaseType, paymentMethod, country,
            coupon: !isWholesale ? coupon.trim() || undefined : undefined,
            items: items.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, color: item.color, size: item.size })),
          }),
        });
        const data = await response.json();
        if (response.ok) { setQuote(data); setError(''); }
        else setError(data.error);
      } catch {
        if (!controller.signal.aborted) setError('Could not refresh basket pricing.');
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [items, coupon, purchaseType, isWholesale, paymentMethod, country]);

  useEffect(() => {
    if (!items.length || !sessionKey.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/checkout/progress', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            sessionKey: sessionKey.current,
            step: address || city ? 'delivery' : phone || email || name ? 'contact' : 'opened',
            customerName: name || undefined,
            email: email || undefined,
            phone: phone || undefined,
            address: address || undefined,
            city: city || undefined,
            country: country || undefined,
            purchaseType,
            items: items.map(item => ({
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              color: item.color,
              size: item.size,
            })),
          }),
        });
        if (response.ok) setSaveNote('Details saved');
      } catch {
        if (!controller.signal.aborted) setSaveNote('');
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [name, email, phone, address, city, country, purchaseType, items]);

  async function checkout(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: requestKey.current,
          sessionKey: sessionKey.current || undefined,
          customerName: name, email, phone, address, city, country,
          paymentMethod, purchaseType,
          coupon: !isWholesale ? coupon.trim() || undefined : undefined,
          items: items.map(item => ({
            productId: item.productId, variantId: item.variantId, quantity: item.quantity,
            color: item.color, size: item.size, fitting: item.fitting, measurements: item.measurements,
          })),
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
      setOrder(data.orderNumber);
      setCompletedType(purchaseType);
      setWhatsApp(data.whatsappUrl || '');
      requestKey.current = '';
      try { sessionStorage.removeItem('as-checkout-session'); } catch {}
      clear();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Order could not be placed');
    } finally {
      setBusy(false);
    }
  }

  if (order) {
    return <main className="page-wrap order-success">
      <span className="eyebrow">ORDER RECEIVED · {completedType}</span>
      <h1>Thank you for choosing AS Collection.</h1>
      <p>Your order reference is <strong>{order}</strong>. {paymentMethod === 'CARD' ? 'Your card payment has been confirmed.' : 'Payment is due on delivery.'} Our team will review your order details.</p>
      {whatsApp && <p><a className="button gold" href={whatsApp} target="_blank" rel="noopener noreferrer">Share order in WhatsApp</a><small className="whatsapp-note">WhatsApp opens with your order details. Please press Send in WhatsApp.</small></p>}
      <Link className="button dark" href="/">Continue shopping</Link>
      <p><Link className="text-link" href="/account">Track or cancel this order</Link></p>
    </main>;
  }

  return <main className="page-wrap">
    <div className="collection-title">
      <span className="eyebrow">YOUR SELECTION · {isWholesale ? 'WHOLESALE' : 'RETAIL'}</span>
      <h1>Checkout</h1>
      {items.length > 0 && <p>One form for delivery and payment. Your details are saved as you type — no account needed.</p>}
    </div>

    {!items.length ? (
      <div className="empty-state">
        <h3>Your bag is waiting for something special.</h3>
        <p>Choose retail shopping or browse the wholesale collection.</p>
        <Link className="button dark" href="/collections/new-arrivals">Shop retail</Link>{' '}
        <Link className="button outline" href="/wholesale">Shop wholesale</Link>
      </div>
    ) : (
      <div className="checkout-shell">
        <section className="checkout-summary-panel">
          <div className="cart-actions">
            <span>{wholesaleQuantity} {isWholesale ? 'wholesale pieces' : 'items'}</span>
            <button className="remove-link" type="button" onClick={clear}>Clear bag</button>
          </div>
          {items.map(item => (
            <article className="cart-line" key={item.key}>
              <div className="cart-thumb">{item.image ? <img src={item.image} alt=""/> : <span>AS</span>}</div>
              <div className="cart-info">
                <Link href={`/product/${item.slug}`}><h3>{item.name}</h3></Link>
                <p>{[item.color, item.size, item.fitting === 'CUSTOM' ? 'Custom fit' : null].filter(Boolean).join(' · ')}</p>
                <label>Qty <input type="number" min="1" max={isWholesale ? '10000' : '20'} value={item.quantity} onChange={event => quantity(item.key, Number(event.target.value))}/></label>
                <button className="remove-link" type="button" onClick={() => remove(item.key)}>Remove</button>
              </div>
              <strong>{formatPrice(item.price * item.quantity, item.usdPriceCents == null ? null : item.usdPriceCents * item.quantity)}</strong>
            </article>
          ))}
          {isWholesale && <div className={minimumRemaining ? 'minimum-note' : 'success-note'}>{minimumRemaining ? `Add ${minimumRemaining} more piece${minimumRemaining === 1 ? '' : 's'} to reach the ${wholesaleMinimum}-piece wholesale minimum.` : `${wholesaleMinimum}-piece wholesale minimum reached.`}</div>}
          <div className="totals">
            <p><span>Subtotal</span><strong>{formatPrice(quote.subtotal)}</strong></p>
            {quote.discount > 0 && <p><span>Discount</span><strong>−{formatPrice(quote.discount)}</strong></p>}
            <p><span>Delivery</span><strong>{quote.shipping ? formatPrice(quote.shipping) : 'Complimentary'}</strong></p>
            <p className="grand-total"><span>Total</span><strong>{formatPrice(quote.total)}</strong></p>
          </div>
        </section>

        <form className="checkout-form-panel" onSubmit={checkout}>
          <div className="checkout-form-heading">
            <div>
              <span className="eyebrow">DELIVERY & PAYMENT</span>
              <h2>Where should we send this?</h2>
            </div>
            {saveNote && <small className="checkout-save-note">{saveNote}</small>}
          </div>

          <label className="field-label">Full name<input required autoComplete="name" value={name} onChange={event => setName(event.target.value)}/></label>
          <label className="field-label">WhatsApp number<input required type="tel" autoComplete="tel" inputMode="tel" placeholder="03001234567" value={phone} onChange={event => setPhone(event.target.value)}/></label>
          <label className="field-label">Email<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}/></label>
          <label className="field-label">Delivery address<textarea required autoComplete="street-address" value={address} onChange={event => setAddress(event.target.value)}/></label>
          <div className="checkout-two-col">
            <label className="field-label">City<input required autoComplete="address-level2" value={city} onChange={event => setCity(event.target.value)}/></label>
            <label className="field-label">Country<select required value={country} onChange={event => { const next = event.target.value; setCountry(next); setPaymentMethod(isPakistan(next) ? 'COD' : 'CARD'); }}><option value="Pakistan">Pakistan</option>{internationalCountries.map((value: string) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
          <p className="small-note">{isInternational ? `Estimated international delivery: ${settings.internationalDeliveryDays || '12–15 days'}. Card payment required.` : isWholesale ? 'Estimated wholesale delivery: 12–15 days after confirmation.' : 'Estimated retail delivery: 4–6 days after confirmation.'}</p>

          <fieldset className="payment-options">
            <legend>Payment method</legend>
            {!isInternational && <label><input type="radio" name="paymentMethod" value="COD" checked={paymentMethod === 'COD'} onChange={() => setPaymentMethod('COD')} disabled={!settings.codEnabled}/> Cash on Delivery <span>Pay when your order arrives</span></label>}
            {(settings.cardPaymentsEnabled || isInternational) && <label><input type="radio" name="paymentMethod" value="CARD" checked={paymentMethod === 'CARD'} onChange={() => setPaymentMethod('CARD')} disabled={!settings.cardPaymentsEnabled}/> Card payment <span>{settings.cardPaymentsEnabled ? '5% card discount' : 'Unavailable until configured'}</span></label>}
          </fieldset>

          {!isWholesale && <label className="field-label">Coupon code<input value={coupon} onChange={event => setCoupon(event.target.value.toUpperCase())} onBlur={() => setCoupon(value => value.trim())}/></label>}
          {quote.couponMessage && <p className={quote.couponApplied ? 'success-note' : 'error-note'}>{quote.couponMessage}</p>}
          {isInternational && !internationalCheckoutReady && <p className="error-note">International checkout is not ready yet.</p>}
          {paymentMethod === 'COD' && !settings.codEnabled && <p className="error-note">Cash on Delivery is currently unavailable.</p>}
          {error && <p className="error-note">{error}</p>}

          <button className="button dark wide" disabled={busy || (paymentMethod === 'COD' && (!settings.codEnabled || isInternational)) || (paymentMethod === 'CARD' && !settings.cardPaymentsEnabled) || (isInternational && !internationalCheckoutReady) || (isWholesale && minimumRemaining > 0)}>
            {busy ? (paymentMethod === 'CARD' ? 'Opening card checkout…' : 'Placing order…') : isWholesale && minimumRemaining > 0 ? `Add ${minimumRemaining} more pieces` : paymentMethod === 'CARD' ? 'Pay by card · 5% off' : 'Place Cash on Delivery order'}
          </button>
          <p className="checkout-policy-links">By placing an order you agree to our <Link href="/policies/terms">Terms</Link>, <Link href="/policies/shipping">Shipping</Link>, <Link href="/policies/returns">Returns</Link>, and <Link href="/policies/privacy">Privacy</Link>.</p>
          <small>No account required. Prices and stock are checked again when you place the order.</small>
        </form>
      </div>
    )}
  </main>;
}
