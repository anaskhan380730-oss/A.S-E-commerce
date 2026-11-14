import { NextResponse } from 'next/server';
import { customerCookieOptions, getCustomer } from '@/lib/auth';

export async function GET() {
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ customer: null }, { headers: { 'Cache-Control': 'no-store' } });
    const safeCustomer = { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, address: customer.address, city: customer.city, country: customer.country };
    return NextResponse.json({ customer: safeCustomer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Customer account service is unavailable. Check that PostgreSQL is running and the account migration has been applied.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('as_customer', '', { ...customerCookieOptions, maxAge: 0 });
  return response;
}
