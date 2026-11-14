'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Check, ShoppingBag, X } from 'lucide-react';
import { getProductImages } from '@/lib/product-images';
import { useCurrency } from '@/components/currency-provider';
import type { StorefrontProduct } from '@/lib/storefront-types';
import { useCart } from './cart-context';

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const images = getProductImages(product);
  const image = images[0] || '';
  const compareAtPrice = product.compareAtPrice ?? 0;
  const variants = product.variants?.filter(variant => variant.active) || [];
  const colors = Array.isArray(product.colors) ? product.colors.filter((value): value is string => typeof value === 'string') : [];
  const sizes = Array.isArray(product.sizes) ? product.sizes.filter((value): value is string => typeof value === 'string') : [];
  const [quickOpen, setQuickOpen] = useState(false);
  const [color, setColor] = useState(colors[0] || '');
  const [size, setSize] = useState(sizes[0] || '');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const { add } = useCart();
  const { formatPrice, currency, usdToPkrRate } = useCurrency();
  const usdPriceCents = product.priceUsdCents ?? null;
  const compareUsdCents = product.compareAtPriceUsdCents ?? (compareAtPrice ? Math.round(compareAtPrice / usdToPkrRate * 100) : null);
  const effectiveUsdCents = usdPriceCents ?? Math.round(product.price / usdToPkrRate * 100);
  const discounted = currency === 'USD' ? (compareUsdCents ?? 0) > effectiveUsdCents : compareAtPrice > product.price;
  const selected = variants.find(variant => (variant.color || '') === color && (variant.size || '') === size);
  const stock = selected?.stock ?? 0;

  function quickAdd() {
    if (!selected || quantity > stock) return;
    const accepted = add({
      productId: product.id,
      variantId: selected.id,
      name: product.name,
      slug: product.slug,
      image,
      price: product.price,
      usdPriceCents,
      color: color || undefined,
      size: size || undefined,
      fitting: 'STANDARD',
      quantity,
      purchaseType: 'RETAIL',
    });
    if (!accepted) {
      setMessage('Your bag has wholesale pieces. Clear it before starting a retail order.');
      setQuickOpen(false);
      return;
    }
    setMessage(`${quantity} ${quantity === 1 ? 'piece' : 'pieces'} added to your bag.`);
    setQuickOpen(false);
  }

  return <article className="product-card">
    <Link className="product-card-link" href={`/product/${product.slug}`}>
      <div className="product-image">
        {image ? <Image src={image} alt={product.name} fill sizes="(max-width: 760px) 50vw, 25vw"/> : <div className="image-placeholder"><span>AS COLLECTION</span><small>Product image</small></div>}
        {product.isNew && <span className="badge">NEW</span>}
        {discounted && <span className="badge sale-badge">OFFER</span>}
      </div>
      <div className="product-meta">
        <div><h3>{product.name}</h3><p>{product.category?.name}</p></div>
        <div className="card-prices"><strong>{formatPrice(product.price, usdPriceCents)}</strong>{discounted && <del>{formatPrice(compareAtPrice, product.compareAtPriceUsdCents)}</del>}</div>
      </div>
      {colors.length > 0 && <div className="swatches">{colors.slice(0, 5).map((value: string) => <span key={value} title={value}>{value}</span>)}</div>}
      {sizes.length > 0 && <small className="stock-caption">Sizes: {sizes.slice(0, 6).join(' · ')}</small>}
      {product.variants && <small className="stock-caption">{product.variants.some(variant => variant.active && variant.stock > 0) ? 'In stock' : 'Sold out'}</small>}
    </Link>
    {variants.length > 0 && <button className="button dark wide product-card-add" type="button" onClick={() => { setMessage(''); setQuickOpen(true); }}><ShoppingBag size={15}/> Add to bag</button>}
    {message && <p className="quick-add-feedback"><Check size={13}/>{message}</p>}
    {quickOpen && <div className="quick-add-backdrop" role="presentation" onClick={() => setQuickOpen(false)}>
      <section className="quick-add-dialog" role="dialog" aria-modal="true" aria-labelledby={`quick-add-${product.id}`} onClick={event => event.stopPropagation()}>
        <button className="quick-add-close" type="button" aria-label="Close quick add" onClick={() => setQuickOpen(false)}><X size={18}/></button>
        <span className="eyebrow">QUICK ADD</span>
        <h2 id={`quick-add-${product.id}`}>{product.name}</h2>
        <p className="small-note">{formatPrice(product.price, usdPriceCents)} · choose your colour and size</p>
        {colors.length > 0 && <label className="field-label">Colour<select value={color} onChange={event => setColor(event.target.value)}>{colors.map((value: string) => <option key={value} value={value}>{value}</option>)}</select></label>}
        {sizes.length > 0 && <label className="field-label">Size<select value={size} onChange={event => setSize(event.target.value)}>{sizes.map((value: string) => <option key={value} value={value}>{value}</option>)}</select></label>}
        <p className="stock-note">{stock > 0 ? `${stock} available in this option` : 'This option is currently unavailable'}</p>
        <label className="field-label">Quantity<input type="number" min="1" max={Math.max(1, stock)} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(Math.max(1, stock), Number(event.target.value) || 1)))}/></label>
        <button className="button dark wide" type="button" disabled={!selected || stock < 1 || quantity > stock} onClick={quickAdd}>Add to bag · {formatPrice(product.price * quantity, usdPriceCents == null ? null : usdPriceCents * quantity)}</button>
        <Link className="quick-add-details" href={`/product/${product.slug}`} onClick={() => setQuickOpen(false)}>View details and custom stitching</Link>
      </section>
    </div>}
  </article>;
}
