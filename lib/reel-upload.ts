import { createHmac, timingSafeEqual } from 'node:crypto';

export type ReelUploadPayload = {
  id: string;
  title: string;
  productId: string | null;
  size: number;
  mime: 'video/mp4' | 'video/webm';
  extension: 'mp4' | 'webm';
  mode: 'cloudinary' | 'local';
  createdAt: number;
  cloud?: string;
  publicId?: string;
};

const uploadSecret = () => process.env.AUTH_SECRET || 'development-only-change-me-32-chars';

export function createReelUploadToken(payload: ReelUploadPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', uploadSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function readReelUploadToken(token: string): ReelUploadPayload | null {
  const [encoded, suppliedSignature, extra] = token.split('.');
  if (!encoded || !suppliedSignature || extra) return null;
  const expectedSignature = createHmac('sha256', uploadSecret()).update(encoded).digest();
  let actualSignature: Buffer;
  try { actualSignature = Buffer.from(suppliedSignature, 'base64url'); }
  catch { return null; }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ReelUploadPayload;
    const age = Date.now() - payload.createdAt;
    if (!payload.id || !payload.title || !Number.isInteger(payload.size) || payload.size < 1 || age < -60_000 || age > 12 * 60 * 60 * 1000) return null;
    if (!['video/mp4', 'video/webm'].includes(payload.mime) || !['mp4', 'webm'].includes(payload.extension)) return null;
    if (!['cloudinary', 'local'].includes(payload.mode)) return null;
    return payload;
  } catch { return null; }
}
