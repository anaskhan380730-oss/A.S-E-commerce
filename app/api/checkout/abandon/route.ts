import { NextResponse } from 'next/server';

// Keep old clients from persisting follow-up data after the feature is disabled.
export async function POST() {
  return NextResponse.json({ saved: false, error: 'Checkout follow-up is disabled.' }, { status: 410 });
}
