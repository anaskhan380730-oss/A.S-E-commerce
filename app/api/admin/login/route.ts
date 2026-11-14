import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { createAdminSessionFor } from '@/lib/auth';
export async function POST(req: Request) {
  const { email, password } = await req.json();
  const admin = typeof email==='string'?await db.adminUser.findUnique({where:{email:email.toLowerCase()}}):null;
  if (!admin || typeof password!=='string') return NextResponse.json({error:'Invalid credentials'}, {status:401});
  const ok = await bcrypt.compare(password,admin.passwordHash);
  if (!ok) return NextResponse.json({error:'Invalid credentials'}, {status:401});
  const token = await createAdminSessionFor(admin.id); const response = NextResponse.json({ok:true});
  response.cookies.set('as_admin', token, {httpOnly:true, secure:process.env.NODE_ENV === 'production', sameSite:'lax', path:'/', maxAge:8*60*60}); return response;
}
