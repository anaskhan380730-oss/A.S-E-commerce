'use client';

import { useCallback, useEffect, useState } from 'react';

type Product = { id: string; name: string; active: boolean };
type Review = {
  id: string;
  author: string;
  rating: number;
  body: string;
  source: 'WHATSAPP' | 'FACEBOOK' | 'OTHER';
  productId: string | null;
  orderId: string | null;
  customerConsent: boolean;
  screenshotConsent: boolean;
  screenshotUrl: string | null;
  verifiedPurchase: boolean;
  approved: boolean;
  createdAt: string;
  order: { number: string } | null;
};

const sourceName = (source: Review['source']) => source === 'WHATSAPP' ? 'WhatsApp' : source === 'FACEBOOK' ? 'Facebook' : 'Other';

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : fallback;
}

async function uploadScreenshot(reviewId: string, file: File) {
  const form = new FormData();
  form.set('reviewId', reviewId);
  form.set('file', file);
  const response = await fetch('/api/admin/reviews/image', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await responseError(response, 'Review saved, but the screenshot upload failed.'));
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reviewResponse, productResponse] = await Promise.all([fetch('/api/admin/reviews'), fetch('/api/admin/products')]);
      const [reviewData, productData] = await Promise.all([reviewResponse.json(), productResponse.json()]);
      if (!reviewResponse.ok || !productResponse.ok) throw new Error(reviewData.error || productData.error || 'Could not load reviews.');
      setReviews(reviewData);
      setProducts(productData.map((product: any) => ({ id: product.id, name: product.name, active: product.active })));
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load reviews.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveNew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const screenshot = values.get('screenshot');
    const screenshotFile = screenshot instanceof File && screenshot.size ? screenshot : null;
    const body = {
      author: String(values.get('author') || ''),
      rating: Number(values.get('rating')),
      body: String(values.get('body') || ''),
      source: String(values.get('source') || 'WHATSAPP'),
      productId: String(values.get('productId') || '') || null,
      orderNumber: String(values.get('orderNumber') || ''),
      customerConsent: values.get('customerConsent') === 'on',
      screenshotConsent: values.get('screenshotConsent') === 'on',
      approved: values.get('approved') === 'on',
    };
    if (screenshotFile && !body.screenshotConsent) { setMessage('Confirm the customer’s separate screenshot permission before uploading it.'); return; }
    setSaving(true);
    setMessage('');
    let savedReview: { id: string; approved: boolean } | null = null;
    try {
      const response = await fetch('/api/admin/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await responseError(response, 'Could not save review.'));
      const review = await response.json();
      savedReview = review;
      if (screenshotFile) await uploadScreenshot(review.id, screenshotFile);
      form.reset();
      await load();
      setMessage(review.approved ? 'Review published on the website.' : 'Review saved as a draft.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not save review.';
      if (savedReview) form.reset();
      await load();
      setMessage(savedReview ? `Review saved, but screenshot upload failed: ${errorMessage}` : errorMessage);
    } finally { setSaving(false); }
  }

  async function updateReview(event: React.FormEvent<HTMLFormElement>, review: Review) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const screenshot = values.get('screenshot');
    const screenshotFile = screenshot instanceof File && screenshot.size ? screenshot : null;
    const body = {
      id: review.id,
      author: String(values.get('author') || ''),
      rating: Number(values.get('rating')),
      body: String(values.get('body') || ''),
      source: String(values.get('source') || 'WHATSAPP'),
      productId: String(values.get('productId') || '') || null,
      orderNumber: String(values.get('orderNumber') || ''),
      customerConsent: values.get('customerConsent') === 'on',
      screenshotConsent: values.get('screenshotConsent') === 'on',
      approved: values.get('approved') === 'on',
    };
    if (screenshotFile && !body.screenshotConsent) { setMessage('Confirm the customer’s separate screenshot permission before uploading it.'); return; }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/reviews', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await responseError(response, 'Could not update review.'));
      const updated = await response.json();
      if (screenshotFile) await uploadScreenshot(updated.id, screenshotFile);
      await load();
      setMessage(updated.approved ? 'Review changes saved and published.' : 'Review saved; it is not public.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not update review.';
      await load();
      setMessage(errorMessage);
    } finally { setSaving(false); }
  }

  async function removeScreenshot(review: Review) {
    if (!window.confirm(`Remove the screenshot attached to ${review.author}’s review?`)) return;
    const response = await fetch('/api/admin/reviews/image', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reviewId: review.id }) });
    if (!response.ok) { setMessage(await responseError(response, 'Could not remove screenshot.')); return; }
    await load();
    setMessage('Review screenshot removed.');
  }

  async function deleteReview(review: Review) {
    if (!window.confirm(`Delete the review from ${review.author}?`)) return;
    const response = await fetch('/api/admin/reviews', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: review.id }) });
    if (!response.ok) { setMessage(await responseError(response, 'Could not delete review.')); return; }
    await load();
    setMessage('Review deleted.');
  }

  return <>
    <section className="admin-card">
      <h2>Add a customer review</h2>
      <p>Copy the review text accurately from WhatsApp or Facebook. Ask before publishing the customer’s words, display name, and screenshot. Crop or blur phone numbers and private chat details before uploading. A “verified purchase” label is added only when the order reference matches a store order.</p>
      <form className="admin-form" onSubmit={saveNew}>
        <label className="field-label">Public display name<input name="author" required maxLength={120} placeholder="First name, initials, or AS Collection customer"/></label>
        <label className="field-label">Review source<select name="source" defaultValue="WHATSAPP"><option value="WHATSAPP">WhatsApp</option><option value="FACEBOOK">Facebook</option><option value="OTHER">Other</option></select></label>
        <label className="field-label">Rating<select name="rating" defaultValue="5">{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} out of 5</option>)}</select></label>
        <label className="field-label">Related product (optional)<select name="productId" defaultValue=""><option value="">General store review</option>{products.filter(product => product.active).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className="field-label span-two">Order reference (optional; must match an order to show verified purchase)<input name="orderNumber" maxLength={120} placeholder="ASC-…"/></label>
        <label className="field-label span-two">Customer’s review<textarea name="body" required minLength={5} maxLength={3000} rows={4} placeholder="Paste the exact review text they gave permission to share"/></label>
        <label className="field-label span-two">WhatsApp / Facebook screenshot <input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp"/><small>Optional · JPEG, PNG, or WebP · max 5 MB</small></label>
        <label className="check-row"><input name="customerConsent" type="checkbox"/> Customer gave permission to publish this review and the display name above</label>
        <label className="check-row"><input name="screenshotConsent" type="checkbox"/> Customer separately gave permission to publish this screenshot</label>
        <label className="check-row"><input name="approved" type="checkbox"/> Publish on the website</label>
        <button className="button dark span-two" disabled={saving}>{saving ? 'Saving review…' : 'Save review'}</button>
      </form>
      {message && <p className={message.startsWith('Could not') || message.includes('permission') || message.includes('match') || message.includes('failed') ? 'error-note' : 'success-note'} role="status">{message}</p>}
    </section>
    <section className="admin-card">
      <h2>Review library · {reviews.length}</h2>
      {loading && !reviews.length ? <p>Loading reviews…</p> : !reviews.length ? <p>No reviews added yet. Reviews stay off the website until you approve them.</p> : <div className="admin-review-list">
        {reviews.map(review => <details className="admin-review-item" key={review.id}>
          <summary><strong>{review.author}</strong> · {sourceName(review.source)} · {review.rating}/5 · {review.approved ? 'Published' : 'Draft'}{review.verifiedPurchase ? ' · Verified order' : ''}{review.screenshotUrl ? ' · Screenshot attached' : ''}</summary>
          <form className="admin-form" onSubmit={event => void updateReview(event, review)}>
            <label className="field-label">Public display name<input name="author" required maxLength={120} defaultValue={review.author}/></label>
            <label className="field-label">Source<select name="source" defaultValue={review.source}><option value="WHATSAPP">WhatsApp</option><option value="FACEBOOK">Facebook</option><option value="OTHER">Other</option></select></label>
            <label className="field-label">Rating<select name="rating" defaultValue={review.rating}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} out of 5</option>)}</select></label>
            <label className="field-label">Related product<select name="productId" defaultValue={review.productId || ''}><option value="">General store review</option>{products.filter(product => product.active).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label className="field-label span-two">Order reference<input name="orderNumber" maxLength={120} defaultValue={review.order?.number || ''} placeholder="Leave blank if not verified"/></label>
            <label className="field-label span-two">Review text<textarea name="body" required minLength={5} maxLength={3000} rows={4} defaultValue={review.body}/></label>
            {review.screenshotUrl && <div className="admin-review-proof"><a href={review.screenshotUrl} target="_blank" rel="noreferrer"><img src={review.screenshotUrl} alt={`Screenshot shared by ${review.author}`} loading="lazy"/></a><button className="button admin-review-delete" type="button" onClick={() => void removeScreenshot(review)}>Remove screenshot</button></div>}
            <label className="field-label span-two">Replace or add screenshot <input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp"/><small>Optional · JPEG, PNG, or WebP · max 5 MB</small></label>
            <label className="check-row"><input name="customerConsent" type="checkbox" defaultChecked={review.customerConsent}/> Customer permission to publish review</label>
            <label className="check-row"><input name="screenshotConsent" type="checkbox" defaultChecked={review.screenshotConsent}/> Separate customer permission to publish screenshot</label>
            <label className="check-row"><input name="approved" type="checkbox" defaultChecked={review.approved}/> Published on website</label>
            <button className="button dark" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            <button className="button admin-review-delete" type="button" onClick={() => void deleteReview(review)}>Delete review</button>
          </form>
        </details>)}
      </div>}
    </section>
  </>;
}
