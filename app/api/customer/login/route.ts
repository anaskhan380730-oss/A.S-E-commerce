import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createCustomerSessionFor, customerCookieOptions } from '@/lib/auth';
import { checkCustomerAuthRateLimit, normalizedEmail } from '@/lib/customer-auth';
import { db } from '@/lib/db';

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Please check your email and password.' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
  try {
    if (!await checkCustomerAuthRateLimit(request, 'login', 10)) return NextResponse.json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, { status: 429 });
    const customer = await db.customer.findUnique({ where: { email: normalizedEmail(parsed.data.email) } });
    if (!customer || !await bcrypt.compare(parsed.data.password, customer.passwordHash)) {
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, customer: { id: customer.id, email: customer.email, name: customer.name } });
    response.cookies.set('as_customer', await createCustomerSessionFor(customer.id, customer.passwordVersion), customerCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: 'Sign-in is unavailable because the database is unavailable or its account migration has not been applied. Start PostgreSQL, run the project database migration, then try again.' }, { status: 503 });
  }
}
