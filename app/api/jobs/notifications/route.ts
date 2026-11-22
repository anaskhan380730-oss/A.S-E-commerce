import { NextResponse } from 'next/server';
import { notificationProviderStatus, runDueOrderConfirmations } from '@/lib/notifications';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const query = new URL(request.url).searchParams.get('secret') || '';
  return bearer === secret || query === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({
      error: 'Unauthorized. Set CRON_SECRET in .env and call this job with Authorization: Bearer <secret>.',
      providers: notificationProviderStatus(),
    }, { status: 401 });
  }
  const confirmations = await runDueOrderConfirmations();
  return NextResponse.json({ ok: true, providers: notificationProviderStatus(), confirmations });
}

export async function GET(request: Request) {
  return POST(request);
}
