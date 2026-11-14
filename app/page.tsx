import Link from 'next/link';
import { db } from '@/lib/db';
import { getProductImages } from '@/lib/product-images';
import { money } from '@/lib/money';
import { ProductCard } from '@/components/product-card';
import { HeroBrandAnimation } from '@/components/hero-brand-animation';
import { CustomerReviews } from '@/components/customer-reviews';
import { ReelsSection } from '@/components/reels-section';
import type { Prisma } from '@/generated/prisma/client';
import type { StorefrontProduct } from '@/lib/storefront-types';

export const dynamic = 'force-dynamic';

function productFilter(section: { key: string; productSlugs: unknown }): Prisma.ProductWhereInput {
  if (Array.isArray(section.productSlugs) && section.productSlugs.length) return { slug: { in: section.productSlugs as string[] } };
  if (section.key === 'featured' || section.key === 'best-sellers') return { featured: true };
  if (section.key === 'new-arrivals') return { isNew: true };
  if (section.key === 'offers' || section.key === 'special-offers') return { OR: [{ compareAtPrice: { not: null } }, { compareAtPriceUsdCents: { not: null } }] };
  return { category: { slug: section.key } };
}

export default async function Home() {
  const [sections, categories, settings, mediaProducts, storeReels, customerReviews] = await Promise.all([
    db.siteSection.findMany({ where: { visible: true }, orderBy: { sortOrder: 'asc' } }),
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.storeSettings.findUnique({ where: { id: 'store' } }),
    db.product.findMany({ where: { active: true }, include: { category: true, variants: true }, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: 12 }),
    db.storeReel.findMany({ where: { active: true }, include: { product: { select: { slug: true, active: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    db.review.findMany({ where: { approved: true, customerConsent: true }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, author: true, rating: true, body: true, source: true, verifiedPurchase: true, screenshotConsent: true, screenshotUrl: true } }),
  ]);
  const hero = sections.find(section => section.key === 'hero');
  const productSections = sections.filter(section => section.key !== 'hero');
  const results = await Promise.all(productSections.map(section => db.product.findMany({
    where: { active: true, ...productFilter(section) },
    include: { category: true, variants: true },
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    take: 4,
  })));
  const media = mediaProducts.map(product => ({
    slug: product.slug,
    name: product.name,
    category: product.category?.name || 'AS Collection',
    image: getProductImages(product)[0] || '',
  })).filter(item => item.image);
  const reels = storeReels.map(reel => ({ id: reel.id, slug: reel.product?.active ? reel.product.slug : undefined, name: reel.title, video: reel.mediaUrl }));
  const deliveryFee = settings?.deliveryFee ?? 250;
  const freeDeliveryThreshold = settings?.freeDeliveryThreshold ?? 10000;
  const wholesaleMinimum = settings?.wholesaleMinimum ?? 50;
  const displayCurrency = settings?.displayCurrency === 'USD' ? 'USD' : 'PKR';
  const usdToPkrRate = Number(settings?.usdToPkrRate) || 280;

  return <main>
    <section className="hero">
      <div className="hero-layout">
        <div className="hero-copy">
          <span className="eyebrow">CRAFTED FOR THE MOMENT</span>
          <h1>{hero?.title || 'A softer kind of statement.'}</h1>
          <p>{hero?.subtitle || 'Modern Pakistani silhouettes, made to be treasured.'}</p>
          <div className="hero-store-details">
            <span>Thoughtful Pakistani fashion, designed for everyday wear.</span>
            <span>Standard delivery {money(deliveryFee, displayCurrency, usdToPkrRate, settings?.deliveryFeeUsdCents)}{freeDeliveryThreshold > 0 ? ` · Free on retail orders over ${money(freeDeliveryThreshold, displayCurrency, usdToPkrRate, settings?.freeDeliveryThresholdUsdCents)}` : ''}</span>
            <Link href="#about">About AS Collection ↓</Link>
          </div>
          <Link className="button gold" href={hero?.buttonUrl || '/collections/new-arrivals'}>{hero?.buttonLabel || 'Explore the collection'}</Link>
          <nav className="hero-order-links" aria-label="Choose retail or wholesale shopping">
            <Link href="/collections/trousers">Shop retail</Link>
            <Link href="/wholesale">Wholesale · {wholesaleMinimum}+ pieces</Link>
          </nav>
          <div className="hero-note">AS COLLECTION <i>—</i> PAKISTAN</div>
        </div>
        <HeroBrandAnimation/>
      </div>
    </section>

    <section className="section">
      <div className="section-heading"><div><span className="eyebrow">DISCOVER YOUR EDIT</span><h2>Shop by category</h2></div><span className="heading-rule"/></div>
      <div className="category-grid">{categories.map((category, index) => <Link key={category.id} className="category-tile" href={`/collections/${category.slug}`}><span>0{index + 1}</span><h3>{category.name}</h3><b>VIEW COLLECTION ↗</b></Link>)}</div>
      {!categories.length && <p className="muted">Collections are being prepared. Please check back soon.</p>}
    </section>

    {productSections.map((section, index) => <section className="section" key={section.id}>
      <div className="section-heading"><div><span className="eyebrow">AS COLLECTION</span><h2>{section.title}</h2></div><Link className="text-link" href={section.buttonUrl || `/collections/${section.key}`}>{section.buttonLabel || 'View all'} ↗</Link></div>
      {section.subtitle && <p className="section-intro">{section.subtitle}</p>}
      <ProductGrid products={results[index]}/>
    </section>)}

    <section className="brand-story" id="about"><span className="eyebrow">A NOTE FROM {settings?.storeName || 'AS COLLECTION'}</span><h2>Tradition, with room to be yourself.</h2><p>Thoughtful fits. Beautiful details. Pieces that feel like you.</p><p>Made for Pakistan, with delivery and order support from our team.</p></section>
    <CustomerReviews reviews={customerReviews}/>
    <ReelsSection items={[...reels, ...media.map(item => ({ ...item, id: item.slug }))].slice(0, 12)}/>
  </main>;
}

function ProductGrid({ products }: { products: StorefrontProduct[] }) {
  if (!products.length) return <div className="empty-state"><h3>A considered collection is on its way.</h3><p>Products will appear here once the collection is ready.</p></div>;
  return <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product}/>)}</div>;
}
