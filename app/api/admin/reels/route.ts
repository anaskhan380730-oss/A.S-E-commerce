import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
const cloudinaryConfig = () => ({
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET,
});

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const reels = await db.storeReel.findMany({
    include: { product: { select: { id: true, name: true, slug: true, active: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  const { cloud, key, secret } = cloudinaryConfig();
  return NextResponse.json({ reels, uploadMode: cloud && key && secret ? 'cloudinary' : 'local' });
}

export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const parsed = z.object({
    id: z.string().min(1),
    title: z.string().trim().min(2).max(120).optional(),
    productId: z.string().nullable().optional(),
    active: z.boolean().optional(),
  }).strict().refine(data => data.title !== undefined || data.productId !== undefined || data.active !== undefined).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Check the video details and try again.' }, { status: 400 });
  const { id, ...changes } = parsed.data;
  if (changes.productId && !await db.product.findUnique({ where: { id: changes.productId }, select: { id: true } })) {
    return NextResponse.json({ error: 'The selected product was not found.' }, { status: 404 });
  }
  try {
    return NextResponse.json(await db.storeReel.update({ where: { id }, data: changes, include: { product: { select: { id: true, name: true, slug: true, active: true } } } }));
  } catch { return NextResponse.json({ error: 'Video not found.' }, { status: 404 }); }
}

export async function DELETE(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const parsed = z.object({ id: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Video not found.' }, { status: 400 });
  const reel = await db.storeReel.findUnique({ where: { id: parsed.data.id } });
  if (!reel) return NextResponse.json({ error: 'Video not found.' }, { status: 404 });

  if (reel.cloudinaryPublicId) {
    const { cloud, key, secret } = cloudinaryConfig();
    if (!cloud || !key || !secret) return NextResponse.json({ error: 'Cloudinary is not configured; video was kept.' }, { status: 503 });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHash('sha1').update(`public_id=${reel.cloudinaryPublicId}&timestamp=${timestamp}${secret}`).digest('hex');
    const form = new FormData();
    form.set('public_id', reel.cloudinaryPublicId);
    form.set('api_key', key);
    form.set('timestamp', timestamp);
    form.set('signature', signature);
    let response: Response;
    try { response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/video/destroy`, { method: 'POST', body: form }); }
    catch { return NextResponse.json({ error: 'Could not reach Cloudinary; video was kept.' }, { status: 502 }); }
    const result = await response.json().catch(() => null);
    if (!response.ok || !['ok', 'not found'].includes(result?.result)) return NextResponse.json({ error: 'Cloudinary could not delete the video; the store entry was kept.' }, { status: 502 });
  }

  if (reel.localFileName) {
    const directory = path.resolve(process.cwd(), 'public', 'uploads', 'reels');
    const target = path.resolve(directory, reel.localFileName);
    if (path.dirname(target) !== directory) return NextResponse.json({ error: 'Invalid video storage path.' }, { status: 400 });
    await unlink(target).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
  }
  await db.storeReel.delete({ where: { id: reel.id } });
  return NextResponse.json({ ok: true });
}
