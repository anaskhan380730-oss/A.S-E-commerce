import { createHash } from 'node:crypto';
import { db } from '@/lib/db';

const WINDOW_MS = 15 * 60 * 1000;

export async function checkRateLimit(request: Request, scope: string, limit: number) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = request.headers.get('x-real-ip')?.trim() || forwarded || 'unknown';
  const key = createHash('sha256')
    .update(`${process.env.AUTH_SECRET || 'development-only'}|customer-auth|${scope}|${address}`)
    .digest('hex');
  const now = new Date();
  await db.customerAuthRateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
  const entry = await db.customerAuthRateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date(now.getTime() + WINDOW_MS) },
    update: { count: { increment: 1 } },
  });
  return entry.count <= limit;
}

export function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); }
  catch { return undefined; }
}
