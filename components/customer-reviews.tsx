import Link from 'next/link';

type CustomerReview = { id: string; author: string; rating: number; body: string; source: string; verifiedPurchase: boolean; screenshotUrl: string | null; screenshotConsent: boolean };

export function CustomerReviews({ reviews = [] }: { reviews?: CustomerReview[] }) {
  return <section className="section customer-reviews" aria-labelledby="reviews-title">
    <span className="eyebrow">CUSTOMER STORIES</span>
    <h2 id="reviews-title">{reviews.length ? 'Kind words from our customers.' : 'Your experience matters to us.'}</h2>
    {reviews.length > 0 ? <div className="customer-review-grid">{reviews.map(review => <article className="customer-review-card" key={review.id}>
      <div className="customer-review-stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}<span>{'★'.repeat(5 - review.rating)}</span></div>
      <blockquote>“{review.body}”</blockquote>
      {review.screenshotConsent && review.screenshotUrl && <a className="customer-review-proof" href={review.screenshotUrl} target="_blank" rel="noreferrer"><img src={review.screenshotUrl} alt={`Customer review screenshot shared by ${review.author}`} loading="lazy"/><span>View original review</span></a>}
      <div className="customer-review-byline"><strong>{review.author}</strong><span>{review.source === 'WHATSAPP' ? 'Shared via WhatsApp' : review.source === 'FACEBOOK' ? 'Shared via Facebook' : 'Customer review'}{review.verifiedPurchase ? ' · Verified purchase' : ''}</span></div>
    </article>)}</div> : <p>Customer reviews will appear here once we have permission to share them.</p>}
    <Link className="button secondary" href="/contact">Share your feedback</Link>
  </section>;
}
