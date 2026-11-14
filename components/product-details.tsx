'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from './cart-context';
import { useCurrency } from '@/components/currency-provider';
import { measurementGroups } from '@/lib/measurements';
import { getProductImages } from '@/lib/product-images';
import type { ProductDetailsRecord } from '@/lib/storefront-types';

export function ProductDetails({ product: p, customStitchingEnabled = true, deliveryFee = 250, freeDeliveryThreshold = 10000, deliveryFeeUsdCents = null, freeDeliveryThresholdUsdCents = null, internationalCountries = '', internationalDeliveryDays = '12–15 days', internationalCheckoutReady = false }: { product: ProductDetailsRecord; customStitchingEnabled?: boolean; deliveryFee?: number; freeDeliveryThreshold?: number; deliveryFeeUsdCents?: number | null; freeDeliveryThresholdUsdCents?: number | null; internationalCountries?: string; internationalDeliveryDays?: string; internationalCheckoutReady?: boolean }) {
  const router = useRouter();
  const [color, setColor] = useState(p.colors?.[0] || ''), [size, setSize] = useState(p.sizes?.[0] || '');
  const [fitting, setFitting] = useState<'STANDARD' | 'CUSTOM'>('STANDARD'), [unit, setUnit] = useState('in');
  const [measurements, setMeasurements] = useState<Record<string, string>>({}), [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(1), [imageIndex, setImageIndex] = useState(0), [zoom, setZoom] = useState(false);
  const { add } = useCart();
  const { formatPrice, currency, usdToPkrRate } = useCurrency();
  const images = getProductImages(p), image = images[imageIndex] || '';
  const compareAtPrice = p.compareAtPrice ?? 0;
  const currentUsdCents = p.priceUsdCents ?? Math.round(p.price / usdToPkrRate * 100);
  const compareUsdCents = p.compareAtPriceUsdCents ?? (compareAtPrice ? Math.round(compareAtPrice / usdToPkrRate * 100) : 0);
  const hasDiscount = currency === 'USD' ? compareUsdCents > currentUsdCents : compareAtPrice > p.price;
  const custom = customStitchingEnabled && (p.customMeasurements ?? p.category.customMeasurements);
  const groups = measurementGroups(p.category.measurementFields, p.category.slug), fields = groups.flatMap(group => group.fields);
  const selected = p.variants.find(variant => variant.active && variant.color === color && variant.size === size)
    || p.variants.find(variant => variant.active && variant.color === null && variant.size === null);
  const stock = selected?.stock || 0;

  useEffect(() => {
    if (images.length < 2 || zoom || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setImageIndex(current => (current + 1) % images.length), 5000);
    return () => window.clearInterval(timer);
  }, [images.length, zoom]);

  useEffect(() => {
    if (!zoom) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setZoom(false);
      if (event.key === 'ArrowLeft') setImageIndex(current => (current - 1 + images.length) % images.length);
      if (event.key === 'ArrowRight') setImageIndex(current => (current + 1) % images.length);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoom, images.length]);

  function moveImage(direction: number) {
    if (images.length > 1) setImageIndex(current => (current + direction + images.length) % images.length);
  }

  function addCart(buyNow = false) {
    if (!selected || stock < quantity) { alert('This option is currently unavailable in that quantity.'); return; }
    if (fitting === 'CUSTOM' && fields.some(field => field.required && !measurements[field.key])) { alert('Please complete each required measurement.'); return; }
    const accepted = add({
      productId: p.id, variantId: selected.id, name: p.name, slug: p.slug, image, price: p.price, usdPriceCents: p.priceUsdCents ?? null,
      color: color || undefined, size: size || undefined, fitting,
      measurements: fitting === 'CUSTOM' ? { unit, ...measurements } : undefined,
      quantity, purchaseType: 'RETAIL',
    });
    if (!accepted) { alert('Your bag currently has wholesale items. Clear it before starting a retail order.'); return; }
    setAdded(true);
    if (buyNow) router.push('/cart');
  }

  return <main className="page-wrap product-detail">
    <div className="detail-gallery">
      <div className="detail-main-image" role="button" tabIndex={image ? 0 : -1} aria-label="Open product image gallery" onClick={() => image && setZoom(true)} onKeyDown={event => { if (image && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setZoom(true); } }}>
        {image ? <Image src={image} alt={p.name} fill sizes="(max-width: 900px) 100vw, 50vw" priority/> : <div className="image-placeholder"><span>AS COLLECTION</span></div>}
        {images.length > 1 && <><button className="detail-gallery-arrow detail-gallery-previous" type="button" aria-label="Previous product image" onClick={event => { event.stopPropagation(); moveImage(-1); }}><span>‹</span></button><button className="detail-gallery-arrow detail-gallery-next" type="button" aria-label="Next product image" onClick={event => { event.stopPropagation(); moveImage(1); }}><span>›</span></button><span className="detail-gallery-count">{imageIndex + 1} / {images.length} · auto</span></>}
      </div>
      {images.length > 1 && <div className="detail-gallery-dots" aria-label="Choose product image">{images.map((src: string, index: number) => <button key={`${src}-${index}`} className={index === imageIndex ? 'active' : ''} type="button" onClick={() => setImageIndex(index)} aria-label={`View product image ${index + 1}`}/>)}</div>}
    </div>
    <div className="detail-copy">
      <Link className="eyebrow" href={`/collections/${p.category.slug}`}>{p.category.name}</Link>
      <h1>{p.name}</h1><p className="sku">STYLE {p.sku}</p>
      <div className="price-line"><strong>{formatPrice(p.price, p.priceUsdCents)}</strong>{hasDiscount && <del>{formatPrice(compareAtPrice, p.compareAtPriceUsdCents)}</del>}</div>
      <p className="small-note">Cash on Delivery · Delivery {formatPrice(deliveryFee, deliveryFeeUsdCents)}{freeDeliveryThreshold > 0 ? ` · Free above ${formatPrice(freeDeliveryThreshold, freeDeliveryThresholdUsdCents)}` : ''}</p>
      <nav className="order-mode-switch detail-order-mode" aria-label="Choose order type"><span className="selected">Retail</span><Link href="/wholesale#wholesale-pricing">Wholesale orders</Link></nav>
      <p className="detail-description">{p.description}</p>
      {p.colors?.length > 0 && <label className="field-label">Colour<select value={color} onChange={event => setColor(event.target.value)}>{p.colors.map((value: string) => <option key={value}>{value}</option>)}</select></label>}
      {p.sizes?.length > 0 && <label className="field-label">Standard size<select value={size} onChange={event => setSize(event.target.value)}>{p.sizes.map((value: string) => <option key={value}>{value}</option>)}</select></label>}
      <p className="stock-note">{stock > 0 ? `${stock} available` : 'Currently unavailable'}</p>
      {custom && <fieldset className="fit-choice"><legend>Choose your fit</legend><label><input type="radio" checked={fitting === 'STANDARD'} onChange={() => setFitting('STANDARD')}/> Standard size</label><label><input type="radio" checked={fitting === 'CUSTOM'} onChange={() => setFitting('CUSTOM')}/> Custom stitching</label></fieldset>}
      {fitting === 'CUSTOM' && custom && <div className="measurements"><p className="small-note">Your measurements are reviewed by our team before stitching. Please enter garment measurements; a team member may contact you to confirm.</p><label className="field-label">Unit<select value={unit} onChange={event => setUnit(event.target.value)}><option value="in">Inches</option><option value="cm">Centimeters</option></select></label>{groups.map(group => <fieldset className="measure-group" key={group.group}><legend>{group.group}</legend><div className="measurement-grid">{group.fields.map(field => <label className="field-label" key={field.key}>{field.label}{field.guide && <small>{field.guide}</small>}<input type="number" min={field.min} max={field.max} step="0.1" required={field.required} value={measurements[field.key] || ''} onChange={event => setMeasurements({ ...measurements, [field.key]: event.target.value })}/></label>)}</div></fieldset>)}<label className="field-label">Fitting notes<textarea maxLength={300} value={measurements.notes || ''} onChange={event => setMeasurements({ ...measurements, notes: event.target.value })}/></label></div>}
      <label className="field-label">Quantity<input type="number" min="1" max={Math.min(20, stock || 1)} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}/></label>
      <button className="button dark wide" onClick={() => addCart()} disabled={!stock}>Add to bag</button>
      <button className="button secondary wide" onClick={() => addCart(true)} disabled={!stock}>Buy now</button>
      {added && <p className="success-note">Added to your bag. <Link href="/cart">View bag →</Link></p>}
      <details className="policy"><summary>Delivery & exchanges</summary><p>Pakistan retail orders are estimated to arrive in 4–6 days after confirmation. Wholesale orders are estimated at 12–15 days. Delivery charges are shown at checkout. {internationalCheckoutReady ? `International delivery is available to ${internationalCountries}; estimated delivery is ${internationalDeliveryDays}. Card payment is required for international orders.` : 'International delivery is not open yet; USD prices alone do not mean international checkout is available.'} Custom-stitching orders are reviewed before production. See our <Link href="/policies/shipping">shipping details</Link> and <Link href="/policies/returns">returns & exchanges policy</Link>.</p></details>
      <details className="policy"><summary>Size guide</summary><p>Custom stitching supports inches and centimeters. Your entries are attached to this product’s order line.</p></details>
    </div>
    {zoom && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`${p.name} image gallery`} onClick={() => setZoom(false)}><button className="lightbox-close" type="button" onClick={() => setZoom(false)}>Close ×</button>{images.length > 1 && <button className="lightbox-arrow lightbox-previous" type="button" aria-label="Previous image" onClick={event => { event.stopPropagation(); moveImage(-1); }}>‹</button>}<Image className="lightbox-image" src={image} alt={p.name} width={1200} height={1600} onClick={event => event.stopPropagation()}/>{images.length > 1 && <button className="lightbox-arrow lightbox-next" type="button" aria-label="Next image" onClick={event => { event.stopPropagation(); moveImage(1); }}>›</button>}<span className="lightbox-count">{imageIndex + 1} / {images.length}</span></div>}
  </main>;
}
