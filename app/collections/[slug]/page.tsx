import Link from 'next/link';
import { Search } from 'lucide-react';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { ProductCard } from '@/components/product-card';
import { money } from '@/lib/money';
import type { Prisma } from '@/generated/prisma/client';

export const dynamic = 'force-dynamic';

const specials: Record<string, { name: string; where: Prisma.ProductWhereInput }> = {
  'new-arrivals': { name: 'New Arrivals', where: { isNew: true } },
  'best-sellers': { name: 'Best Sellers', where: { featured: true } },
  offers: { name: 'Offers & Sale', where: { OR: [{ compareAtPrice: { not: null } }, { compareAtPriceUsdCents: { not: null } }] } },
};

export default async function Collection({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; sort?: string; color?: string; available?: string; page?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const special = specials[slug];
  const category = special ? null : await db.category.findUnique({ where: { slug } });
  if (!special && !category) notFound();

  const page = Math.max(1, Number(search.page) || 1);
  const pageSize = 24;
  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(special ? special.where : { categoryId: category!.id }),
    ...(search.q ? { OR: [{ name: { contains: search.q, mode: 'insensitive' } }, { sku: { contains: search.q, mode: 'insensitive' } }] } : {}),
    ...(search.color || search.available === '1' ? { variants: { some: { ...(search.color ? { color: search.color } : {}), ...(search.available === '1' ? { stock: { gt: 0 } } : {}), active: true } } } : {}),
  };
  const [products, total, all, offers, settings] = await Promise.all([
    db.product.findMany({ where, include: { category: true, variants: true }, orderBy: search.sort === 'price-asc' ? { price: 'asc' } : search.sort === 'price-desc' ? { price: 'desc' } : { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.product.count({ where }),
    db.product.findMany({ where: { active: true, ...(special ? special.where : { categoryId: category!.id }) }, select: { colors: true }, take: 500 }),
    slug === 'offers' ? db.promotion.findMany({ where: { active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }] }, select: { id: true, name: true, type: true, code: true, minimumOrder: true, maxUses: true, useCount: true }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    db.storeSettings.findUnique({ where: { id: 'store' } }),
  ]);
  const colors = [...new Set(all.flatMap(product => Array.isArray(product.colors) ? product.colors as string[] : []))].sort();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const displayCurrency = settings?.displayCurrency === 'USD' ? 'USD' : 'PKR';
  const usdToPkrRate = Number(settings?.usdToPkrRate) || 280;

  return <main className="page-wrap">
    <div className="collection-title"><span className="eyebrow">THE AS EDIT</span><h1>{special?.name || category?.name}</h1><p>{category?.description || 'A considered edit of pieces, made for the way you move.'}</p></div>
    {slug === 'offers' && offers.length > 0 && <div className="offer-list">{offers.filter(promotion => promotion.maxUses === null || promotion.useCount < promotion.maxUses).map(promotion => <article key={promotion.id}><strong>{promotion.name}</strong><span>{promotion.code ? `Use code ${promotion.code}` : promotion.type.replaceAll('_', ' ')}{promotion.minimumOrder ? ` · Minimum ${money(promotion.minimumOrder, displayCurrency, usdToPkrRate)}` : ''}</span></article>)}</div>}
    <form method="get" className="filterbar">
      <input name="q" placeholder="Search this collection" defaultValue={search.q}/>
      <select name="color" defaultValue={search.color || ''}><option value="">All colours</option>{colors.map(color => <option key={color} value={color}>{color}</option>)}</select>
      <select name="available" defaultValue={search.available || ''}><option value="">Any stock status</option><option value="1">In stock</option></select>
      <select name="sort" defaultValue={search.sort || 'latest'}><option value="latest">Latest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select>
      <button className="button dark"><Search size={15}/> Apply</button>
    </form>
    {products.length ? <><div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product}/>)}</div>{pages > 1 && <nav className="pagination" aria-label="Collection pages">{page > 1 && <Link href={`?${new URLSearchParams({ q: search.q || '', color: search.color || '', available: search.available || '', sort: search.sort || 'latest', page: String(page - 1) })}`}>← Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={`?${new URLSearchParams({ q: search.q || '', color: search.color || '', available: search.available || '', sort: search.sort || 'latest', page: String(page + 1) })}`}>Next →</Link>}</nav>}</> : <div className="empty-state"><h3>Nothing here just yet</h3><p>Check back soon or browse another collection.</p></div>}
  </main>;
}
