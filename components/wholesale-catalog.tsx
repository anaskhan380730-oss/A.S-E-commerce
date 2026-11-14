'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/cart-context';
import { useCurrency } from '@/components/currency-provider';
import { getProductImages } from '@/lib/product-images';

type WholesaleSelection = {
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  usdPriceCents?: number | null;
  quantity: number;
  color?: string;
  size?: string;
  fitting: 'STANDARD';
  purchaseType: 'WHOLESALE';
  stock: number;
};

function selectionKey(line: Pick<WholesaleSelection, 'productId' | 'variantId' | 'color' | 'size'>) {
  return JSON.stringify([line.productId, line.variantId, line.color, line.size]);
}

function WholesaleProduct({ product, wholesalePrice, reservedByVariant, onAddSelection }: {
  product: any;
  wholesalePrice: number;
  reservedByVariant: Record<string, number>;
  onAddSelection: (line: WholesaleSelection) => string;
}) {
  const { formatPrice, wholesaleUsdPriceCents } = useCurrency();
  const colors: string[] = Array.isArray(product.colors) ? product.colors : [];
  const sizes: string[] = Array.isArray(product.sizes) ? product.sizes : [];
  const productWholesalePrice = product.wholesalePrice ?? wholesalePrice;
  const productWholesaleUsdPriceCents = product.wholesalePriceUsdCents ?? wholesaleUsdPriceCents;
  const [color, setColor] = useState(colors[0] || product.variants?.find((v: any) => v.active)?.color || '');
  const [size, setSize] = useState(sizes[0] || product.variants?.find((v: any) => v.active)?.size || '');
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState('');
  const images = getProductImages(product);
  const selected = product.variants?.find((variant: any) => variant.active !== false && variant.color === color && variant.size === size)
    || product.variants?.find((variant: any) => variant.active !== false && variant.color === null && variant.size === null);
  const stock = selected?.stock || 0;
  const reserved = selected?.id ? reservedByVariant[selected.id] || 0 : 0;
  const available = Math.max(0, stock - reserved);

  function addSelection() {
    if (!selected || quantity < 1 || quantity > available) return;
    const result = onAddSelection({
      productId: product.id,
      variantId: selected.id,
      name: product.name,
      slug: product.slug,
      image: images[0] || '',
      price: productWholesalePrice,
      usdPriceCents: productWholesaleUsdPriceCents,
      quantity,
      color: color || undefined,
      size: size || undefined,
      fitting: 'STANDARD',
      purchaseType: 'WHOLESALE',
      stock,
    });
    setNotice(result);
    if (!result.startsWith('Only')) setQuantity(1);
  }

  return <article className="wholesale-card">
    <Link className="wholesale-image" href={`/product/${product.slug}`}>{images[0] ? <img src={images[0]} alt={product.name}/> : <div className="image-placeholder"><span>AS COLLECTION</span></div>}</Link>
    <div className="wholesale-card-copy"><div className="wholesale-product-heading"><h2>{product.name}</h2><strong>{formatPrice(productWholesalePrice, productWholesaleUsdPriceCents)} <small>/ piece</small></strong></div>
      <p className="wholesale-stock">{available > 0 ? `${available} available in selected option${reserved ? ` · ${reserved} already selected` : ''}` : 'No additional stock in this option'}</p>
      {colors.length > 0 && <label className="field-label">Colour<select value={color} onChange={event => { setColor(event.target.value); setNotice(''); }}>{colors.map(value => <option key={value}>{value}</option>)}</select></label>}
      {sizes.length > 0 && <label className="field-label">Size<select value={size} onChange={event => { setSize(event.target.value); setNotice(''); }}>{sizes.map(value => <option key={value}>{value}</option>)}</select></label>}
      <label className="field-label">Quantity<input type="number" min="1" max={Math.max(available, 1)} value={quantity} onChange={event => { setQuantity(Math.max(1, Math.min(10000, Number(event.target.value) || 1))); setNotice(''); }}/></label>
      <button className="button dark wide" type="button" onClick={addSelection} disabled={!selected || available < quantity}>Select pieces · {formatPrice(productWholesalePrice * quantity, productWholesaleUsdPriceCents == null ? null : productWholesaleUsdPriceCents * quantity)}</button>
      {notice && <p className={notice.startsWith('Only') ? 'error-note' : 'success-note'} role="status">{notice}</p>}
    </div>
  </article>;
}

export function WholesaleCatalog({ products, wholesalePrice, wholesaleMinimum }: { products: any[]; wholesalePrice: number; wholesaleMinimum: number }) {
  const router = useRouter();
  const { items, add } = useCart();
  const [selections, setSelections] = useState<WholesaleSelection[]>([]);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const currentWholesalePieces = items.filter(item => item.purchaseType === 'WHOLESALE').reduce((sum, item) => sum + item.quantity, 0);
  const selectedPieces = selections.reduce((sum, item) => sum + item.quantity, 0);
  const totalPieces = currentWholesalePieces + selectedPieces;
  const remaining = Math.max(0, wholesaleMinimum - totalPieces);
  const hasRetailItems = items.some(item => item.purchaseType !== 'WHOLESALE');
  const readyToOrder = totalPieces >= wholesaleMinimum && !hasRetailItems && !busy;
  const reservedByVariant = useMemo(() => {
    const reserved: Record<string, number> = {};
    for (const item of items) {
      if (item.purchaseType === 'WHOLESALE' && item.variantId) reserved[item.variantId] = (reserved[item.variantId] || 0) + item.quantity;
    }
    for (const item of selections) reserved[item.variantId] = (reserved[item.variantId] || 0) + item.quantity;
    return reserved;
  }, [items, selections]);

  function addSelection(line: WholesaleSelection) {
    const key = selectionKey(line);
    const previous = selections.find(item => selectionKey(item) === key)?.quantity || 0;
    const alreadyInBag = items.filter(item => item.purchaseType === 'WHOLESALE' && item.variantId === line.variantId).reduce((sum, item) => sum + item.quantity, 0);
    if (previous + alreadyInBag + line.quantity > line.stock) return `Only ${Math.max(0, line.stock - previous - alreadyInBag)} more available for this colour and size.`;
    setSelections(current => {
      const existing = current.find(item => selectionKey(item) === key);
      if (existing) return current.map(item => selectionKey(item) === key ? { ...item, quantity: item.quantity + line.quantity } : item);
      return [...current, line];
    });
    setFeedback('');
    return `${line.quantity} selected · ${line.color || 'Colour'} · ${line.size || 'Size'}`;
  }

  function removeSelection(key: string) {
    setSelections(current => current.filter(item => selectionKey(item) !== key));
    setFeedback('');
  }

  function finishOrder(buyNow: boolean) {
    if (hasRetailItems) { setFeedback('Your bag has retail items. Clear the retail bag before adding a wholesale order.'); return; }
    if (totalPieces < wholesaleMinimum) { setFeedback(`Select ${remaining} more piece${remaining === 1 ? '' : 's'} to reach the minimum.`); return; }
    if (!selections.length) { router.push('/cart'); return; }

    setBusy(true);
    for (const selection of selections) {
      const { stock: _stock, ...line } = selection;
      if (!add(line)) {
        setFeedback('Could not add the wholesale selection. Please review your bag.');
        setBusy(false);
        return;
      }
    }
    setSelections([]);
    setFeedback('Wholesale order added to your bag.');
    setBusy(false);
    if (buyNow) router.push('/cart');
  }

  if (!products.length) return <div className="empty-state"><h3>Wholesale collection coming soon.</h3><p>Please contact AS Collection to discuss bulk availability.</p></div>;

  return <>
    <section className="wholesale-order-summary" aria-live="polite">
      <div className="wholesale-progress-copy"><div className="wholesale-progress-heading"><strong>Build your wholesale order</strong><span>{totalPieces} / {wholesaleMinimum} pieces</span></div>
        <progress max={wholesaleMinimum} value={Math.min(totalPieces, wholesaleMinimum)}/>
        <p className={remaining ? 'minimum-note' : 'success-note'}>{remaining ? `Select ${remaining} more piece${remaining === 1 ? '' : 's'} across any designs, colours and sizes.` : 'Minimum reached. You can add your wholesale order to the bag.'}</p>
        {currentWholesalePieces > 0 && <small>{currentWholesalePieces} wholesale piece{currentWholesalePieces === 1 ? '' : 's'} already in your bag.</small>}
        {hasRetailItems && <p className="error-note">Your bag currently has retail items. <Link href="/cart">Open your bag to clear them</Link> before placing a wholesale order.</p>}
        {selections.length > 0 && <details className="wholesale-selection-review"><summary>Review selected options ({selectedPieces} pieces)</summary>{selections.map(item => <div className="wholesale-selection-row" key={selectionKey(item)}><span>{item.name} · {item.color || '—'} · {item.size || '—'} × {item.quantity}</span><button className="remove-link" type="button" onClick={() => removeSelection(selectionKey(item))}>Remove</button></div>)}</details>}
        {feedback && <p className={feedback.startsWith('Your') || feedback.startsWith('Could') ? 'error-note' : 'success-note'} role="status">{feedback}</p>}
      </div>
      <div className="wholesale-order-actions"><button className="button dark" type="button" disabled={!readyToOrder} onClick={() => finishOrder(false)}>{selections.length ? 'Add wholesale order to bag' : 'Go to wholesale bag'}</button><button className="button secondary" type="button" disabled={!readyToOrder} onClick={() => finishOrder(true)}>{selections.length ? 'Buy now' : 'Checkout now'}</button></div>
    </section>
    <div id="wholesale-products" className="wholesale-grid">{products.map(product => <WholesaleProduct key={product.id} product={product} wholesalePrice={wholesalePrice} reservedByVariant={reservedByVariant} onAddSelection={addSelection}/>)}</div>
  </>;
}
