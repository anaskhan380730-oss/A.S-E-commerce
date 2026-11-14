import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { removeReviewScreenshot } from '@/lib/review-screenshot-storage';

export const runtime = 'nodejs';

const maxBytes = 5 * 1024 * 1024;

function imageExtension(file: File, bytes: Buffer) {
  if (file.type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (file.type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (file.type === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (Number(request.headers.get('content-length') || 0) > maxBytes + 100_000) return NextResponse.json({ error: 'Image exceeds the 5 MB limit.' }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'Invalid image upload.' }, { status: 400 }); }

  const reviewId = String(form.get('reviewId') || '');
  const file = form.get('file');
  if (!(file instanceof File) || !reviewId) return NextResponse.json({ error: 'Choose a screenshot to upload.' }, { status: 400 });
  if (file.size < 1 || file.size > maxBytes) return NextResponse.json({ error: 'Screenshot must be 5 MB or smaller.' }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = imageExtension(file, bytes);
  if (!extension) return NextResponse.json({ error: 'Upload a valid JPEG, PNG, or WebP screenshot.' }, { status: 400 });

  const review = await db.review.findUnique({ where: { id: reviewId }, select: { id: true, screenshotConsent: true, screenshotUrl: true, screenshotCloudinaryPublicId: true, screenshotLocalFileName: true } });
  if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  if (!review.screenshotConsent) return NextResponse.json({ error: 'Confirm the customer’s separate permission to publish this screenshot first.' }, { status: 400 });

  let url: string;
  let publicId: string | null = null;
  let localFileName: string | null = null;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;

  if (cloud && key && secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = 'as-collection/reviews';
    const signature = createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest('hex');
    const data = new FormData();
    data.set('file', new Blob([bytes], { type: file.type }), file.name);
    data.set('api_key', key);
    data.set('timestamp', timestamp);
    data.set('folder', folder);
    data.set('signature', signature);
    let response: Response;
    try { response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: 'POST', body: data }); }
    catch { return NextResponse.json({ error: 'Could not reach Cloudinary to upload the screenshot.' }, { status: 502 }); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.secure_url !== 'string' || typeof result.public_id !== 'string') return NextResponse.json({ error: 'Cloudinary rejected the screenshot upload.' }, { status: 502 });
    url = result.secure_url;
    publicId = result.public_id;
  } else {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Configure Cloudinary before uploading review screenshots in production.' }, { status: 503 });
    localFileName = `${randomUUID()}.${extension}`;
    const directory = path.join(process.cwd(), 'public', 'uploads', 'reviews');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, localFileName), bytes, { flag: 'wx' });
    url = `/uploads/reviews/${localFileName}`;
  }

  const updated = await db.review.update({
    where: { id: review.id },
    data: { screenshotUrl: url, screenshotCloudinaryPublicId: publicId, screenshotLocalFileName: localFileName },
  });
  await removeReviewScreenshot(review);
  return NextResponse.json({ screenshotUrl: updated.screenshotUrl }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || !('reviewId' in body) || typeof body.reviewId !== 'string') return NextResponse.json({ error: 'Review not found.' }, { status: 400 });
  const review = await db.review.findUnique({ where: { id: body.reviewId }, select: { id: true, screenshotUrl: true, screenshotCloudinaryPublicId: true, screenshotLocalFileName: true } });
  if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  await removeReviewScreenshot(review);
  await db.review.update({ where: { id: review.id }, data: { screenshotUrl: null, screenshotCloudinaryPublicId: null, screenshotLocalFileName: null } });
  return NextResponse.json({ ok: true });
}
