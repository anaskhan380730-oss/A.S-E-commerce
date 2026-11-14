import { createHmac, timingSafeEqual } from 'node:crypto';

type SafepayEnvelope<T> = {
  ok?: boolean;
  data?: T;
  status?: { errors?: unknown[]; message?: string };
};

type TrackerResponse = {
  tracker?: { token?: string };
};

export type SafepayTracker = {
  token?: string;
  state?: string;
  purchase_totals?: {
    base_amount?: { currency?: string; amount?: number };
    quote_amount?: { currency?: string; amount?: number };
  };
  charge?: { amount?: { currency?: string; amount?: number } };
};

export type SafepayWebhookEvent = {
  type?: string;
  merchant_api_key?: string;
  data?: {
    tracker?: string;
    state?: string;
    amount?: number;
    currency?: string;
    refund_amount?: number;
    balance?: number | { amount?: number };
  };
};

function environment() {
  return process.env.SAFEPAY_ENV === 'production' ? 'production' : 'sandbox';
}

function apiHost() {
  return environment() === 'production'
    ? 'https://api.getsafepay.com'
    : 'https://sandbox.api.getsafepay.com';
}

function checkoutHost() {
  return environment() === 'production' ? 'https://getsafepay.com' : 'https://sandbox.api.getsafepay.com';
}

function appUrl() {
  const value = process.env.APP_URL?.trim();
  if (!value) throw new Error('Set APP_URL in .env before enabling card payments.');
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error('APP_URL in .env must be a valid website URL.'); }
  if (environment() === 'production' && parsed.protocol !== 'https:') {
    throw new Error('Live card payments require an HTTPS APP_URL.');
  }
  if (parsed.protocol !== 'https:' && !(environment() === 'sandbox' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('APP_URL must use HTTPS, except for local sandbox development.');
  }
  return parsed.origin;
}

export function safepayStatus() {
  const cardPaymentsRequested = process.env.CARD_PAYMENTS_ENABLED?.trim().toLowerCase() === 'true';
  const configured = Boolean(
    process.env.SAFEPAY_API_KEY?.trim()
    && process.env.SAFEPAY_SECRET_KEY?.trim()
    && process.env.SAFEPAY_WEBHOOK_SECRET?.trim()
    && process.env.APP_URL?.trim(),
  );
  let safeUrl = false;
  try { appUrl(); safeUrl = true; } catch { safeUrl = false; }
  return {
    cardPaymentsEnabled: cardPaymentsRequested && configured && safeUrl,
    cardPaymentEnvironment: environment(),
    cardWebhookConfigured: Boolean(process.env.SAFEPAY_WEBHOOK_SECRET?.trim()),
  };
}

export function assertSafepayReady() {
  if (process.env.CARD_PAYMENTS_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new Error('Card payments are currently turned off. Cash on Delivery is the available payment option.');
  }
  if (!safepayStatus().cardPaymentsEnabled) {
    throw new Error('Card checkout is not configured yet. Add Safepay sandbox keys and webhook secret to .env.');
  }
  appUrl();
  if (!process.env.SAFEPAY_API_KEY || !process.env.SAFEPAY_SECRET_KEY) {
    throw new Error('Safepay keys are missing from .env.');
  }
}

async function safepayRequest<T>(path: string, body?: Record<string, unknown>): Promise<SafepayEnvelope<T>> {
  assertSafepayReady();
  const response = await fetch(`${apiHost()}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'X-SFPY-MERCHANT-SECRET': process.env.SAFEPAY_SECRET_KEY!,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => null) as SafepayEnvelope<T> | null;
  if (!response.ok || !result || result.ok === false || (result.status?.errors?.length ?? 0) > 0) {
    throw new Error('Safepay could not start or verify this payment. Please try again or choose Cash on Delivery.');
  }
  return result;
}

export async function createSafepayTracker(orderNumber: string, totalPkr: number) {
  if (!Number.isSafeInteger(totalPkr) || totalPkr < 1) throw new Error('The payment total is invalid.');
  const response = await safepayRequest<TrackerResponse>('/order/payments/v3/', {
    merchant_api_key: process.env.SAFEPAY_API_KEY!,
    intent: 'CYBERSOURCE',
    mode: 'payment',
    entry_mode: 'raw',
    currency: 'PKR',
    amount: totalPkr * 100,
    metadata: { order_id: orderNumber },
    include_fees: false,
  });
  const tracker = response.data?.tracker?.token;
  if (!tracker || !tracker.startsWith('track_')) throw new Error('Safepay did not return a payment reference.');
  return tracker;
}

export async function createSafepayCheckoutUrl(tracker: string, orderNumber: string) {
  const response = await safepayRequest<string>('/client/passport/v1/token', {});
  const tbt = typeof response.data === 'string' ? response.data : '';
  if (!tbt) throw new Error('Safepay could not create a checkout session. Please try again.');

  const returnUrl = new URL('/payment/return', `${appUrl()}/`);
  returnUrl.searchParams.set('orderNumber', orderNumber);
  const checkoutUrl = new URL('/embedded/', checkoutHost());
  checkoutUrl.search = new URLSearchParams({
    environment: environment(),
    tracker,
    tbt,
    source: 'hosted',
    order_id: orderNumber,
    redirect_url: returnUrl.toString(),
    cancel_url: returnUrl.toString(),
  }).toString();
  return checkoutUrl.toString();
}

export async function fetchSafepayTracker(tracker: string) {
  const response = await safepayRequest<SafepayTracker>(`/reporter/api/v1/payments/${encodeURIComponent(tracker)}`);
  return response.data;
}

export function verifySafepayWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.SAFEPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const received = signature.trim().replace(/^sha512=/i, '').toLowerCase();
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function trackerPaymentAmount(tracker: SafepayTracker) {
  return tracker.purchase_totals?.base_amount ?? tracker.purchase_totals?.quote_amount ?? tracker.charge?.amount ?? null;
}
