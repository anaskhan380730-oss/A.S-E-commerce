import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { policyContent, policyPages } from '@/lib/policy-content';

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const policy = policyPages[slug as keyof typeof policyPages];
  if (!policy) notFound();
  const settings = await db.storeSettings.findUnique({ where: { id: 'store' } });
  const content = policyContent(policy.field, settings?.[policy.field]);

  return <main className="page-wrap policy-page">
    <header className="collection-title"><span className="eyebrow">AS COLLECTION · CUSTOMER INFORMATION</span><h1>{policy.title}</h1><p>Clear information for shopping with AS Collection.</p></header>
    <article className="admin-card policy-content" aria-label={policy.title}>
      {content.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </article>
  </main>;
}
