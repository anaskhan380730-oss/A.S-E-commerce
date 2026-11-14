import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
const key = () => { const secret=process.env.AUTH_SECRET; if(process.env.NODE_ENV==='production'&&(!secret||secret.length<32))throw new Error('AUTH_SECRET must be at least 32 characters in production.'); return new TextEncoder().encode(secret || 'development-only-change-me-32-chars'); };
export async function isAdmin() {
  const token = (await cookies()).get('as_admin')?.value;
  if (!token) return false;
  try { const { payload } = await jwtVerify(token, key()); if(payload.role!=='admin'||typeof payload.sub!=='string')return false;return !!await db.adminUser.findUnique({where:{id:payload.sub},select:{id:true}}); } catch { return false; }
}
export async function getAdmin(){const token=(await cookies()).get('as_admin')?.value;if(!token)return null;try{const {payload}=await jwtVerify(token,key());if(payload.role!=='admin'||typeof payload.sub!=='string')return null;return await db.adminUser.findUnique({where:{id:payload.sub},select:{id:true,email:true}})}catch{return null}}
export async function createAdminSessionFor(id:string){return new SignJWT({role:'admin'}).setSubject(id).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').sign(key())}

const customerSelect = { id: true, email: true, name: true, phone: true, address: true, city: true, country: true, passwordVersion: true } as const;

export async function createCustomerSessionFor(id: string, passwordVersion: number) {
  return new SignJWT({ role: 'customer', passwordVersion })
    .setSubject(id)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key());
}

export async function getCustomer() {
  const token = (await cookies()).get('as_customer')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.role !== 'customer' || typeof payload.sub !== 'string' || typeof payload.passwordVersion !== 'number') return null;
    const customer = await db.customer.findUnique({ where: { id: payload.sub }, select: customerSelect });
    if (!customer || customer.passwordVersion !== payload.passwordVersion) return null;
    return customer;
  } catch { return null; }
}

export const customerCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
};
