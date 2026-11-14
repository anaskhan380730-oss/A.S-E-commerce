import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';
import { productSchema } from '@/lib/validators';
import { createHash } from 'node:crypto';
const variantSku=(base:string,color:string|null,size:string|null)=>`${base.slice(0,20)}-${createHash('sha256').update(`${base}|${color||''}|${size||''}`).digest('hex').slice(0,16).toUpperCase()}`;
export async function GET(){if(!await isAdmin())return NextResponse.json({error:'Unauthorized'},{status:401});return NextResponse.json(await db.product.findMany({include:{category:true,variants:true},orderBy:{createdAt:'desc'}}))}
export async function POST(req: Request) {
  if (!await isAdmin()) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const parsed = productSchema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({error:parsed.error.flatten()}, {status:400});
  const p = parsed.data;
  try {
    const colors=p.colors.length?p.colors:[null],sizes=p.sizes.length?p.sizes:[null];const variants=p.colors.length||p.sizes.length?colors.flatMap(color=>sizes.map(size=>({color,size,sku:variantSku(p.sku,color,size),stock:p.stock}))):[{color:null,size:null,sku:variantSku(p.sku,null,null),stock:p.stock}];
    const product = await db.product.create({data:{name:p.name,slug:p.slug,sku:p.sku,description:p.description,price:p.price,compareAtPrice:p.compareAtPrice,priceUsdCents:p.priceUsdCents??null,compareAtPriceUsdCents:p.compareAtPriceUsdCents??null,wholesalePrice:p.wholesalePrice??null,wholesalePriceUsdCents:p.wholesalePriceUsdCents??null,categoryId:p.categoryId,images:p.images,colors:p.colors,sizes:p.sizes,featured:p.featured,isNew:p.isNew,wholesaleEnabled:p.wholesaleEnabled,customMeasurements:p.customMeasurements??null,variants:{create:variants}}});
    return NextResponse.json(product,{status:201});
  } catch { return NextResponse.json({error:'Could not create product. Check that SKU and slug are unique.'},{status:409}); }
}
