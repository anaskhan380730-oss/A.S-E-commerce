'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Reel = { id: string; slug?: string; name: string; image?: string; video?: string; category?: string };

export function ReelsSection({ items }: { items: Reel[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [items.length]);
  if (!items.length) return null;
  const visible = Array.from({ length: Math.min(3, items.length) }, (_, offset) => items[(index + offset) % items.length]);
  const move = (direction: number) => setIndex(current => (current + direction + items.length) % items.length);

  return <section className="section reels-section" aria-labelledby="reels-title">
    <div className="section-heading"><div><span className="eyebrow">AS COLLECTION · REELS</span><h2 id="reels-title">See the details up close</h2></div>
      {items.length > 1 && <div className="slider-controls"><button type="button" aria-label="Previous collection images" onClick={() => move(-1)}><ChevronLeft size={17}/></button><button type="button" aria-label="Next collection images" onClick={() => move(1)}><ChevronRight size={17}/></button></div>}
    </div>
    <p className="section-intro">Explore the details, embroidery and colours in our latest designs.</p>
    <div className="reels-grid" aria-live="polite">{visible.map((item, slot) => item.video ? <article className="reel-card reel-video-card" key={`${item.id}-${slot}`}>
      <video src={item.video} controls playsInline preload="metadata" aria-label={item.name}/><span className="reel-caption"><small>{item.category || 'AS COLLECTION · VIDEO'}</small><strong>{item.name}</strong>{item.slug && <Link href={`/product/${item.slug}`}>Shop this design ↗</Link>}</span>
    </article> : <Link className="reel-card" href={item.slug ? `/product/${item.slug}` : '/collections/new-arrivals'} key={`${item.id}-${slot}`}>
      {item.image && <Image src={item.image} alt={item.name} fill sizes="(max-width: 760px) 50vw, 30vw"/>}<span className="reel-caption"><small>{item.category || 'AS COLLECTION'}</small><strong>{item.name}</strong></span>
    </Link>)}</div>
  </section>;
}
