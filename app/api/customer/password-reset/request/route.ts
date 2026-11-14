import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCustomerAuthRateLimit, normalizedEmail } from '@/lib/customer-auth';
import { db } from '@/lib/db';
import { isEmailDeliveryConfigured, sendEmail } from '@/lib/email';

const schema = z.object({ email: z.string().trim().email().max(254) }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Enter the email on your account.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!await checkCustomerAuthRateLimit(request, 'password-reset-request', 5)) return NextResponse.json({ error: 'Too many requests. Please wait 15 minutes and try again.' }, { status: 429 });
  if (!isEmailDeliveryConfigured()) return NextResponse.json({ error: 'Password-reset email is not set up yet. The store owner must configure the email service first.' }, { status: 503 });

  const email = normalizedEmail(parsed.data.email);
  await db.customerPasswordResetToken.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const customer = await db.customer.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!customer) return NextResponse.json({ ok: true, message: 'If this email belongs to an account, a reset link will be sent.' });

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.customerPasswordResetToken.deleteMany({ where: { customerId: customer.id } });
  await db.customerPasswordResetToken.create({ data: { customerId: customer.id, tokenHash, expiresAt } });
  const baseUrl = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, '');
  let resetUrl: URL;
  try {
    resetUrl = new URL('/account/reset-password', baseUrl);
    if (process.env.NODE_ENV === 'production' && resetUrl.protocol !== 'https:') throw new Error('HTTPS required');
    resetUrl.hash = `token=${encodeURIComponent(token)}`;
  } catch {
    await db.customerPasswordResetToken.deleteMany({ where: { tokenHash } });
    return NextResponse.json({ error: 'Password-reset email settings need a public HTTPS website URL.' }, { status: 503 });
  }

  try {
    await sendEmail({
      to: email,
      subject: 'Reset your AS Collection password',
      text: `We received a request to reset your AS Collection password. Use this one-time link within 60 minutes:\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
    });
  } catch {
    await db.customerPasswordResetToken.deleteMany({ where: { tokenHash } });
    return NextResponse.json({ error: 'The reset email could not be sent. Please try again later or contact AS Collection.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, message: 'If this email belongs to an account, a reset link will be sent.' });
}
