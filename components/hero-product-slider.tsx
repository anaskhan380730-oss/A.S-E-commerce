'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Slide = { slug: string; name: string; image: string };

export function HeroProductSlider({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % slides.length), 4500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!slides.length) return null;
  const visible = Array.from({ length: Math.min(3, slides.length) }, (_, offset) => slides[(index + offset) % slides.length]);
  const move = (direction: number) => setIndex(current => (current + direction + slides.length) % slides.length);

  return <div className="hero-slider-shell">
    <div className="hero-product-gallery" role="group" aria-label="Featured A.S Collection designs">
      {visible.map((slide, slot) => <Link className={`hero-product hero-product-slot hero-product-slot-${slot}`} href={`/product/${slide.slug}`} key={`${slide.slug}-${slot}`}>
        <Image src={slide.image} alt={slide.name} fill sizes="(max-width: 760px) 33vw, 20vw"/><span className="hero-slide-caption">{slide.name}</span>
      </Link>)}
    </div>
    {slides.length > 1 && <div className="hero-slider-controls" aria-label="Featured designs controls">
      <button type="button" aria-label="Previous designs" onClick={() => move(-1)}><ChevronLeft size={15}/></button>
      <span>{index + 1} / {slides.length}</span>
      <button type="button" aria-label="Next designs" onClick={() => move(1)}><ChevronRight size={15}/></button>
    </div>}
  </div>;
}
