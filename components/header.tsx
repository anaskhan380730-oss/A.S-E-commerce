'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, ShoppingBag, Menu, X } from 'lucide-react';
import { useCart } from './cart-context';

const links = [
  ['Home', '/'],
  ['Trousers', 'trousers'],
  ['Festive Shalwar', 'festive-shalwar'],
  ['Ladies Kurtis', 'ladies-kurtis'],
  ['Kurti & Pajama Sets', 'kurti-pajama-sets'],
  ['New Arrivals', 'new-arrivals'],
  ['Offers', 'offers'],
  ['Wholesale', '/wholesale'],
];

function hrefFor(slug: string) {
  if (slug.startsWith('/')) return slug;
  if (slug === 'new-arrivals' || slug === 'offers') return `/collections/${slug}`;
  return `/collections/${slug}`;
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState('');
  const { items } = useCart();

  return <>
    <div className="announcement">Thoughtful Pakistani fashion, made for every occasion</div>
    <header className="site-header">
      <button className="icon-button mobile-only" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
      <Link href="/" className="wordmark brand-lockup" aria-label="A.S Collection home"><span className="brand-initials">A.S</span><span className="brand-name">COLLECTION</span></Link>
      <nav className={open ? 'nav open' : 'nav'} aria-label="Main navigation">{links.map(([label, slug]) => <Link key={slug} href={hrefFor(slug)} onClick={() => setOpen(false)}>{label}</Link>)}</nav>
      <div className="head-actions">
        <button className="icon-button" aria-label="Search" onClick={() => setSearch(!search)}><Search/></button>
        <Link href="/account" className="head-link">Account</Link>
        <Link href="/cart" className="cart-link"><ShoppingBag size={19}/> <span>Bag ({items.reduce((sum, item) => sum + item.quantity, 0)})</span></Link>
      </div>
    </header>
    {search && <form action="/search" className="searchbar"><input name="q" autoFocus placeholder="Search designs, collections, categories…" value={query} onChange={event => setQuery(event.target.value)}/><button className="button dark">Search</button></form>}
  </>;
}
