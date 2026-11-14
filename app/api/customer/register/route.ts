import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createCustomerSessionFor, customerCookieOptions } from '@/lib/auth';
import { checkCustomerAuthRateLimit, normalizedEmail, validPasswordLength } from '@/lib/customer-auth';
import { db } from '@/lib/db';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(30).refine(value => {
    const digits = value.replace(/\D/g, '');
    return /^[+0-9().\s-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
  }),
  password: z.string().min(1).max(200),
}).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Please check the form and try again.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Enter your name, valid email, WhatsApp number with country code, and a password of at least 10 characters.' }, { status: 400 });
  if (!validPasswordLength(parsed.data.password)) return NextResponse.json({ error: 'Password must be at least 10 characters and no more than 72 bytes.' }, { status: 400 });
  try {
    if (!await checkCustomerAuthRateLimit(request, 'register', 5)) return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, { status: 429 });
  } catch {
    return NextResponse.json({ error: 'Customer accounts are not ready because the database is unavailable or its migration has not been applied. Start PostgreSQL, run the project database migration, then try again.' }, { status: 503 });
  }

  const email = normalizedEmail(parsed.data.email);
  try {
    const customer = await db.customer.create({
      data: { name: parsed.data.name, email, phone: parsed.data.phone, passwordHash: await bcrypt.hash(parsed.data.password, 12) },
      select: { id: true, email: true, name: true, phone: true, address: true, city: true, country: true, passwordVersion: true },
    });
    const response = NextResponse.json({ ok: true, customer: { id: customer.id, email: customer.email, name: customer.name } }, { status: 201 });
    response.cookies.set('as_customer', await createCustomerSessionFor(customer.id, customer.passwordVersion), customerCookieOptions);
    return response;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
    if (code === 'P2002') return NextResponse.json({ error: 'An account already uses this email. Please sign in or reset its password.' }, { status: 409 });
    return NextResponse.json({ error: 'Account could not be created right now. Please try again.' }, { status: 500 });
  }
}
