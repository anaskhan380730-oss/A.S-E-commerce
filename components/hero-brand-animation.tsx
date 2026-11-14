'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export function HeroBrandAnimation() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return <div ref={stageRef} className={`hero-brand-stage${visible ? ' is-visible' : ''}`} role="img" aria-label="A.S Collection gold logo animation">
    <span className="hero-brand-silk" aria-hidden="true"/>
    <span className="hero-brand-halo" aria-hidden="true"/>
    <span className="hero-brand-orbit hero-brand-orbit-one" aria-hidden="true"/>
    <span className="hero-brand-orbit hero-brand-orbit-two" aria-hidden="true"/>
    <span className="hero-brand-embroidery hero-brand-embroidery-one" aria-hidden="true"/>
    <span className="hero-brand-embroidery hero-brand-embroidery-two" aria-hidden="true"/>
    <div className="hero-brand-logo">
      <Image src="/as-logo.png" alt="A.S Collection" fill preload sizes="(max-width: 760px) 94vw, 48vw"/>
    </div>
    <span className="hero-brand-sheen" aria-hidden="true"/>
    <div className="hero-brand-signature"><strong>A.S COLLECTION</strong><span>PAKISTANI OCCASIONWEAR · EST. 2021</span></div>
  </div>;
}
