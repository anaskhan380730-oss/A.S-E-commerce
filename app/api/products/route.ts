import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const url = new URL(req.url); const q = url.searchParams.get('q')?.trim(); const category = url.searchParams.get('category');
  const products = await db.product.findMany({ where: { active:true, ...(category ? {category:{slug:category}} : {}), ...(q ? {OR:[{name:{contains:q,mode:'insensitive'}},{description:{contains:q,mode:'insensitive'}},{sku:{contains:q,mode:'insensitive'}},{category:{name:{contains:q,mode:'insensitive'}}}]} : {}) }, include:{category:true,variants:true}, orderBy:[{featured:'desc'},{createdAt:'desc'}] });
  return NextResponse.json(products);
}
