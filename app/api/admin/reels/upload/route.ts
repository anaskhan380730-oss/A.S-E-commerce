import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { createReelUploadToken, readReelUploadToken, type ReelUploadPayload } from '@/lib/reel-upload';

export const runtime = 'nodejs';

const MAX_VIDEO_BYTES = 1_000_000_000;
const CHUNK_BYTES = 6_000_000;
const tempDirectory = path.join(os.tmpdir(), 'as-collection-reel-uploads');
const cloudinaryConfig = () => ({
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadSignature(payload: ReelUploadPayload, timestamp: string) {
  const { secret } = cloudinaryConfig();
  if (!secret || !payload.publicId) throw new Error('Cloudinary is not configured.');
  const signedParameters = `allowed_formats=mp4,webm&overwrite=false&public_id=${payload.publicId}&timestamp=${timestamp}`;
  return createHash('sha1').update(`${signedParameters}${secret}`).digest('hex');
}

function getUploadPayload(request: Request) {
  const token = request.headers.get('x-reel-upload-token') || '';
  return readReelUploadToken(token);
}

async function pruneOldLocalUploads() {
  await mkdir(tempDirectory, { recursive: true });
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const files = await readdir(tempDirectory).catch(() => []);
  await Promise.all(files.filter(name => /^[0-9a-f-]{36}\.part$/i.test(name)).map(async name => {
    const target = path.join(tempDirectory, name);
    const info = await stat(target).catch(() => null);
    if (info && info.mtimeMs < cutoff) await unlink(target).catch(() => {});
  }));
}

async function saveReel(payload: ReelUploadPayload, mediaUrl: string, cloudinaryPublicId: string | null, localFileName: string | null) {
  const existing = await db.storeReel.findFirst({ where: cloudinaryPublicId ? { cloudinaryPublicId } : { localFileName } });
  if (existing) return existing;
  const latest = await db.storeReel.aggregate({ _max: { sortOrder: true } });
  return db.storeReel.create({
    data: { title: payload.title, productId: payload.productId, mediaUrl, cloudinaryPublicId, localFileName, sortOrder: (latest._max.sortOrder ?? -1) + 1 },
    include: { product: { select: { id: true, name: true, slug: true, active: true } } },
  });
}

async function deleteCloudinaryAsset(payload: ReelUploadPayload) {
  const { key, secret } = cloudinaryConfig();
  if (!payload.cloud || !key || !secret || !payload.publicId) return;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash('sha1').update(`public_id=${payload.publicId}&timestamp=${timestamp}${secret}`).digest('hex');
  const form = new FormData();
  form.set('public_id', payload.publicId);
  form.set('api_key', key);
  form.set('timestamp', timestamp);
  form.set('signature', signature);
  await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(payload.cloud)}/video/destroy`, { method: 'POST', body: form }).catch(() => null);
}

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 }); }

  const action = (body as { action?: unknown } | null)?.action;
  if (action === 'start') {
    const parsed = z.object({
      title: z.string().trim().min(2).max(120),
      productId: z.string().nullable().optional(),
      size: z.number().int().min(1).max(MAX_VIDEO_BYTES),
      mime: z.enum(['video/mp4', 'video/webm']),
    }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Choose an MP4 or WebM video up to 1,000 MB and enter a valid title.' }, { status: 400 });
    const productId = parsed.data.productId || null;
    if (productId && !await db.product.findUnique({ where: { id: productId }, select: { id: true } })) {
      return NextResponse.json({ error: 'The selected product was not found.' }, { status: 404 });
    }
    const { cloud, key, secret } = cloudinaryConfig();
    const mode: ReelUploadPayload['mode'] = cloud && key && secret ? 'cloudinary' : 'local';
    if (mode === 'local' && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Configure Cloudinary in the hosting environment before uploading live videos.' }, { status: 503 });
    }
    const id = randomUUID();
    const payload: ReelUploadPayload = {
      id, title: parsed.data.title, productId, size: parsed.data.size, mime: parsed.data.mime,
      extension: parsed.data.mime === 'video/mp4' ? 'mp4' : 'webm', mode, createdAt: Date.now(),
      ...(mode === 'cloudinary' ? { cloud, publicId: `as-collection/reels/reel-${id}` } : {}),
    };
    const uploadToken = createReelUploadToken(payload);
    if (mode === 'local') await pruneOldLocalUploads();
    return NextResponse.json({ mode, uploadId: id, uploadToken, chunkBytes: CHUNK_BYTES, ...(mode === 'cloudinary' ? { cloudName: cloud, apiKey: key, publicId: payload.publicId } : {}) });
  }

  if (action === 'sign') {
    const parsed = z.object({ uploadToken: z.string().min(20) }).safeParse(body);
    const payload = parsed.success ? readReelUploadToken(parsed.data.uploadToken) : null;
    if (!payload || payload.mode !== 'cloudinary') return NextResponse.json({ error: 'This upload session is invalid or expired.' }, { status: 400 });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    try { return NextResponse.json({ timestamp, signature: uploadSignature(payload, timestamp) }); }
    catch { return NextResponse.json({ error: 'Cloudinary is not configured correctly.' }, { status: 503 }); }
  }

  if (action === 'complete') {
    const parsed = z.object({ uploadToken: z.string().min(20) }).safeParse(body);
    const payload = parsed.success ? readReelUploadToken(parsed.data.uploadToken) : null;
    if (!payload) return NextResponse.json({ error: 'This upload session is invalid or expired.' }, { status: 400 });
    try {
      if (payload.mode === 'local') {
        const tempFile = path.join(tempDirectory, `${payload.id}.part`);
        const info = await stat(tempFile).catch(() => null);
        if (!info || info.size !== payload.size) return NextResponse.json({ error: 'The video upload is incomplete. Please retry it.' }, { status: 400 });
        const handle = await open(tempFile, 'r');
        const header = Buffer.alloc(16);
        try { await handle.read(header, 0, header.length, 0); }
        finally { await handle.close(); }
        const valid = payload.extension === 'mp4'
          ? header.subarray(4, 8).toString() === 'ftyp'
          : header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
        if (!valid) { await unlink(tempFile).catch(() => {}); return NextResponse.json({ error: 'The video file contents do not match the selected format.' }, { status: 400 }); }
        const localFileName = `${payload.id}.${payload.extension}`;
        const directory = path.join(process.cwd(), 'public', 'uploads', 'reels');
        await mkdir(directory, { recursive: true });
        const target = path.join(directory, localFileName);
        await rename(tempFile, target);
        try {
          const reel = await saveReel(payload, `/uploads/reels/${localFileName}`, null, localFileName);
          return NextResponse.json({ reel }, { status: 201 });
        } catch {
          await unlink(target).catch(() => {});
          return NextResponse.json({ error: 'Video uploaded, but could not be saved in the store.' }, { status: 500 });
        }
      }

      const { key, secret } = cloudinaryConfig();
      if (!payload.cloud || !key || !secret || !payload.publicId) return NextResponse.json({ error: 'Cloudinary is not configured correctly.' }, { status: 503 });
      const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(payload.cloud)}/resources/video/upload/${encodeURIComponent(payload.publicId)}`;
      const response = await fetch(url, { headers: { authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }, cache: 'no-store' });
      const asset = await response.json().catch(() => null);
      if (!response.ok || asset?.public_id !== payload.publicId || asset?.resource_type !== 'video') {
        return NextResponse.json({ error: 'Cloudinary could not verify the completed upload.' }, { status: 502 });
      }
      if (asset.bytes !== payload.size || asset.bytes > MAX_VIDEO_BYTES || !['mp4', 'webm'].includes(asset.format) || typeof asset.secure_url !== 'string') {
        await deleteCloudinaryAsset(payload).catch(() => {});
        return NextResponse.json({ error: 'The uploaded video must be MP4 or WebM and no larger than 1,000 MB.' }, { status: 413 });
      }
      try {
        const reel = await saveReel(payload, asset.secure_url, payload.publicId, null);
        return NextResponse.json({ reel }, { status: 201 });
      } catch {
        await deleteCloudinaryAsset(payload).catch(() => {});
        return NextResponse.json({ error: 'Video uploaded, but could not be saved in the store.' }, { status: 500 });
      }
    } catch {
      return NextResponse.json({ error: 'Could not finish saving the uploaded video.' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Choose a valid upload action.' }, { status: 400 });
}

export async function PUT(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = getUploadPayload(request);
  if (!payload || payload.mode !== 'local') return NextResponse.json({ error: 'This local upload session is invalid or expired.' }, { status: 400 });
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(request.headers.get('content-range') || '');
  if (!match) return NextResponse.json({ error: 'The upload chunk range is invalid.' }, { status: 400 });
  const start = Number(match[1]), end = Number(match[2]), total = Number(match[3]);
  if (total !== payload.size || end < start || end >= total || end - start + 1 > CHUNK_BYTES || (end + 1 < total && end - start + 1 !== CHUNK_BYTES)) {
    return NextResponse.json({ error: 'The upload chunk size or range is invalid.' }, { status: 400 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length !== end - start + 1) return NextResponse.json({ error: 'The upload chunk was incomplete.' }, { status: 400 });
  await mkdir(tempDirectory, { recursive: true });
  const target = path.join(tempDirectory, `${payload.id}.part`);
  const current = await stat(target).catch(() => null);
  const nextOffset = current?.size || 0;
  if (nextOffset !== start) return NextResponse.json({ error: 'The upload is out of sequence.', nextOffset }, { status: 409 });
  try {
    await appendFile(target, bytes, { flag: start === 0 ? 'wx' : 'a' });
    return NextResponse.json({ nextOffset: end + 1 });
  } catch {
    return NextResponse.json({ error: 'Could not save this upload chunk.' }, { status: 500 });
  }
}
