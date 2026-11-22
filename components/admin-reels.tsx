'use client';

import { useCallback, useEffect, useState } from 'react';

type ProductOption = { id: string; name: string; active: boolean };
type Reel = { id: string; title: string; mediaUrl: string; active: boolean; productId: string | null; product?: ProductOption | null };
const MAX_VIDEO_BYTES = 1_000_000_000;

function sendUploadRequest(url: string, method: 'POST' | 'PUT', body: XMLHttpRequestBodyInit, headers: Record<string, string>, onProgress: (loaded: number) => void) {
  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded); };
    request.onerror = () => reject(new Error('Network error while uploading. Check your connection and try again.'));
    request.onabort = () => reject(new Error('The video upload was interrupted.'));
    request.onload = () => {
      let data: any = {};
      try { data = request.responseText ? JSON.parse(request.responseText) : {}; } catch {}
      resolve({ status: request.status, data });
    };
    request.send(body);
  });
}

export default function AdminReels() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [uploadMode, setUploadMode] = useState<'cloudinary' | 'local'>('local');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reelResponse, productResponse] = await Promise.all([fetch('/api/admin/reels'), fetch('/api/admin/products')]);
      const [reelData, productData] = await Promise.all([reelResponse.json(), productResponse.json()]);
      if (!reelResponse.ok || !productResponse.ok) throw new Error(reelData.error || productData.error || 'Could not load video settings.');
      setReels(reelData.reels);
      setUploadMode(reelData.uploadMode);
      setProducts(productData.map((product: any) => ({ id: product.id, name: product.name, active: product.active })));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load video settings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function uploadVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get('file');
    if (!(file instanceof File) || file.size < 1) { setMessage('Choose an MP4 or WebM video first.'); return; }
    const mime = file.type || (file.name.toLowerCase().endsWith('.webm') ? 'video/webm' : file.name.toLowerCase().endsWith('.mp4') ? 'video/mp4' : '');
    if (!['video/mp4', 'video/webm'].includes(mime)) { setMessage('Upload an MP4 or WebM video.'); return; }
    if (file.size > MAX_VIDEO_BYTES) { setMessage('Video must be 1,000 MB (1 GB) or smaller.'); return; }
    setUploading(true);
    setUploadPercent(0);
    try {
      const startResponse = await fetch('/api/admin/reels/upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start', title: String(values.get('title') || ''), productId: String(values.get('productId') || '') || null, size: file.size, mime }),
      });
      const session = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok) throw new Error(session.error || 'Could not start the video upload.');
      let cloudResult: any = null;
      for (let start = 0; start < file.size; start += session.chunkBytes) {
        const end = Math.min(file.size, start + session.chunkBytes);
        if (session.mode === 'cloudinary') {
          const signatureResponse = await fetch('/api/admin/reels/upload', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'sign', uploadToken: session.uploadToken }),
          });
          const signature = await signatureResponse.json().catch(() => ({}));
          if (!signatureResponse.ok) throw new Error(signature.error || 'Could not authorize this upload chunk.');
          const chunk = new FormData();
          chunk.append('file', file.slice(start, end), file.name);
          chunk.append('api_key', session.apiKey);
          chunk.append('timestamp', signature.timestamp);
          chunk.append('public_id', session.publicId);
          chunk.append('allowed_formats', 'mp4,webm');
          chunk.append('overwrite', 'false');
          chunk.append('signature', signature.signature);
          const result = await sendUploadRequest(`https://api.cloudinary.com/v1_1/${encodeURIComponent(session.cloudName)}/video/upload`, 'POST', chunk, {
            'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
            'X-Unique-Upload-Id': session.uploadId,
          }, loaded => setUploadPercent(Math.floor(Math.min(file.size, start + loaded) / file.size * 100)));
          if (result.status < 200 || result.status >= 300) throw new Error(result.data?.error?.message || result.data?.error || 'Cloudinary rejected this video chunk. Check your account upload limit.');
          if (end === file.size) cloudResult = result.data;
        } else {
          const result = await sendUploadRequest('/api/admin/reels/upload', 'PUT', file.slice(start, end), {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
            'X-Reel-Upload-Token': session.uploadToken,
          }, loaded => setUploadPercent(Math.floor(Math.min(file.size, start + loaded) / file.size * 100)));
          if (result.status === 409 && result.data.nextOffset === end) continue;
          if (result.status < 200 || result.status >= 300) throw new Error(result.data.error || 'Could not save this video chunk.');
        }
      }
      if (session.mode === 'cloudinary' && cloudResult?.done !== true && typeof cloudResult?.secure_url !== 'string') {
        throw new Error('Cloudinary did not confirm the completed video upload.');
      }
      const response = await fetch('/api/admin/reels/upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'complete', uploadToken: session.uploadToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the uploaded video.');
      form.reset();
      setUploadPercent(100);
      setMessage(`“${data.reel.title}” was added to the homepage video section.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not upload the video.');
    } finally { setUploading(false); }
  }

  async function updateVideo(event: React.FormEvent<HTMLFormElement>, reel: Reel) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const response = await fetch('/api/admin/reels', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: reel.id, title: String(values.get('title') || ''), productId: String(values.get('productId') || '') || null }),
    });
    const data = await response.json();
    setMessage(response.ok ? 'Video details saved.' : data.error || 'Could not save video details.');
    if (response.ok) await load();
  }

  async function toggleVideo(reel: Reel) {
    const response = await fetch('/api/admin/reels', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: reel.id, active: !reel.active }),
    });
    const data = await response.json();
    setMessage(response.ok ? `Video ${reel.active ? 'hidden from' : 'published on'} the homepage.` : data.error || 'Could not update video.');
    if (response.ok) await load();
  }

  async function deleteVideo(reel: Reel) {
    if (!window.confirm(`Permanently delete “${reel.title}” and its uploaded video?`)) return;
    const response = await fetch('/api/admin/reels', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: reel.id }),
    });
    const data = await response.json();
    setMessage(response.ok ? 'Video deleted.' : data.error || 'Could not delete video.');
    if (response.ok) await load();
  }

  return <>
    <section className="admin-card">
      <h2>Homepage reels and videos</h2>
      <p>Upload a close-up video for the Reels section at the bottom of the homepage. MP4 or WebM, up to 1,000 MB (1 GB). Large videos upload in small chunks.</p>
      {uploadMode === 'cloudinary' ? <p className="success-note">Cloudinary is configured. Large videos upload directly to Cloudinary; your account plan must allow files this size.</p> : <p className="small-note">Local upload mode: videos are saved on this computer for preview. Configure Cloudinary before launch to store videos permanently on the live website.</p>}
      <form className="admin-form" onSubmit={uploadVideo}>
        <label className="field-label">Video title<input required name="title" minLength={2} maxLength={120} placeholder="e.g. Embroidery close-up · Beige"/></label>
        <label className="field-label">Link this video to a product (optional)<select name="productId" defaultValue=""><option value="">No product link</option>{products.filter(product => product.active).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className="field-label span-two">Choose video file<input required name="file" type="file" accept="video/mp4,video/webm,.mp4,.webm"/></label>
        <button className="button dark span-two" disabled={uploading}>{uploading ? 'Uploading video…' : 'Upload video to homepage'}</button>
      </form>
      {uploading && <div className="span-two" aria-live="polite"><progress max={100} value={uploadPercent} style={{ width: '100%' }}/><small>{uploadPercent}% uploaded · large videos may take a while</small></div>}
      {message && <p className={message.includes('Could not') || message.includes('Configure') ? 'error-note' : 'success-note'} role="status">{message}</p>}
    </section>
    <section className="admin-card">
      <h2>Homepage video library · {reels.length}</h2>
      {loading && !reels.length ? <p>Loading videos…</p> : !reels.length ? <p>No videos uploaded yet. Your homepage currently uses product photos in this section.</p> : <div className="admin-reel-list">{reels.map(reel => <article className="admin-reel-item" key={reel.id}>
        <video src={reel.mediaUrl} controls playsInline preload="metadata" aria-label={reel.title}/>
        <form className="admin-form" onSubmit={event => updateVideo(event, reel)}>
          <label className="field-label">Video title<input required name="title" minLength={2} maxLength={120} defaultValue={reel.title}/></label>
          <label className="field-label">Linked product<select name="productId" defaultValue={reel.productId || ''}><option value="">No product link</option>{products.filter(product => product.active).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <button className="button dark">Save details</button>
          <button className="button" type="button" onClick={() => void toggleVideo(reel)}>{reel.active ? 'Hide from homepage' : 'Publish on homepage'}</button>
          <button className="button admin-reel-delete" type="button" onClick={() => void deleteVideo(reel)}>Delete video</button>
        </form>
      </article>)}</div>}
    </section>
  </>;
}
