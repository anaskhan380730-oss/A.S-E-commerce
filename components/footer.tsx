import Link from 'next/link';

export function Footer() {
  return <footer className="site-footer">
    <div className="footer-brand"><Link href="/" className="wordmark brand-lockup" aria-label="A.S Collection home"><span className="brand-initials">A.S</span><span className="brand-name">COLLECTION</span></Link><p>Thoughtful Pakistani fashion, made for the way you move.</p></div>
    <div className="footer-col"><strong>EXPLORE</strong><Link href="/">Home</Link><Link href="/collections/trousers">Trousers</Link><Link href="/collections/festive-shalwar">Festive Shalwar</Link><Link href="/collections/ladies-kurtis">Ladies Kurtis</Link><Link href="/collections/kurti-pajama-sets">Kurti &amp; Pajama Sets</Link><Link href="/wholesale">Wholesale</Link></div>
    <div className="footer-col"><strong>NEED HELP?</strong><Link href="/account">Find your order</Link><Link href="/collections/offers">Offers</Link><Link href="/contact">WhatsApp &amp; contact</Link></div>
    <div className="footer-col"><strong>POLICIES</strong><Link href="/policies/shipping">Shipping &amp; delivery</Link><Link href="/policies/returns">Returns &amp; exchanges</Link><Link href="/policies/privacy">Privacy</Link><Link href="/policies/terms">Terms of service</Link></div>
    <div className="footer-bottom">© 2021–{new Date().getFullYear()} AS Collection <span>Muhammad Anas</span></div>
  </footer>;
}
