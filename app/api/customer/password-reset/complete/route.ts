import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCustomerAuthRateLimit, validPasswordLength } from '@/lib/customer-auth';
import { db } from '@/lib/db';

const schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200) }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'This reset link is invalid. Request a new one.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'This reset link is invalid. Request a new one.' }, { status: 400 });
  if (!validPasswordLength(parsed.data.password)) return NextResponse.json({ error: 'Password must be at least 10 characters and no more than 72 bytes.' }, { status: 400 });
  if (!await checkCustomerAuthRateLimit(request, 'password-reset-complete', 10)) return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, { status: 429 });

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    await db.$transaction(async tx => {
      const reset = await tx.customerPasswordResetToken.findUnique({ where: { tokenHash }, include: { customer: true } });
      if (!reset || reset.expiresAt <= new Date()) throw new Error('INVALID_RESET');
      await tx.customer.update({ where: { id: reset.customerId }, data: { passwordHash, passwordVersion: { increment: 1 } } });
      await tx.customerPasswordResetToken.deleteMany({ where: { customerId: reset.customerId } });
    }, { isolationLevel: 'Serializable' });
  } catch {
    return NextResponse.json({ error: 'This reset link is invalid or expired. Request a new one.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: 'Password changed. You can sign in with your new password.' });
}
