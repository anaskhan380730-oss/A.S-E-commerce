import{NextResponse}from'next/server';import{getAdmin}from'@/lib/auth';
export async function GET(){const admin=await getAdmin();return admin?NextResponse.json({admin}):NextResponse.json({error:'Unauthorized'},{status:401})}
export async function DELETE(){const r=NextResponse.json({ok:true});r.cookies.set('as_admin','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});return r}
