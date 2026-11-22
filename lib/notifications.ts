import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { isEmailDeliveryConfigured, sendEmail } from '@/lib/email';
import { getStoreSettings } from '@/lib/store-settings';

export type NotificationKind = 'ORDER_CONFIRMATION' | 'FEEDBACK_REQUEST';
export type NotificationChannel = 'EMAIL' | 'WHATSAPP';
type ProviderResult = { status: 'SENT' | 'LOGGED' | 'FAILED' | 'SKIPPED'; provider: string; error?: string };
export type DeliveryResult = ProviderResult | { status: 'DUPLICATE'; provider: string };

export function whatsappProviderName() {
  return (process.env.WHATSAPP_PROVIDER || 'log').trim().toLowerCase();
}

export function notificationProviderStatus() {
  return {
    email: isEmailDeliveryConfigured() ? 'resend' : 'log',
    whatsapp: whatsappProviderName(),
    cronConfigured: Boolean(process.env.CRON_SECRET),
  };
}

export function whatsappDigits(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return `92${digits.slice(1)}`;
  return digits;
}

export function customerKey(phone: string, email: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) return `p:${digits.slice(-10)}`;
  return `e:${email.trim().toLowerCase()}`;
}

export function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

async function sendWhatsApp(to: string, text: string): Promise<ProviderResult> {
  const provider = whatsappProviderName();
  const digits = whatsappDigits(to);
  if (digits.length < 10) return { status: 'SKIPPED', provider, error: 'No valid WhatsApp number on this order.' };
  if (provider === 'log') {
    console.info(`[whatsapp:log] to=${digits} message=${JSON.stringify(text)}`);
    return { status: 'LOGGED', provider };
  }
  return { status: 'FAILED', provider, error: `WhatsApp provider "${provider}" is not connected yet. Set WHATSAPP_PROVIDER="log" until the WhatsApp Business API integration is added.` };
}

async function sendEmailMessage(to: string, subject: string, text: string): Promise<ProviderResult> {
  if (!to.includes('@')) return { status: 'SKIPPED', provider: 'none', error: 'No email address on this order.' };
  if (!isEmailDeliveryConfigured()) {
    console.info(`[email:log] to=${to} subject=${JSON.stringify(subject)}`);
    return { status: 'LOGGED', provider: 'log' };
  }
  try {
    await sendEmail({ to, subject, text });
    return { status: 'SENT', provider: 'resend' };
  } catch (error) {
    return { status: 'FAILED', provider: 'resend', error: error instanceof Error ? error.message : 'Email could not be sent.' };
  }
}

// The unique (kind, channel, referenceId) row is claimed before sending, so a message
// can never go out twice; only FAILED attempts may be retried.
async function deliverOnce(kind: NotificationKind, channel: NotificationChannel, referenceId: string, recipient: string, send: () => Promise<ProviderResult>): Promise<DeliveryResult> {
  let logId: string;
  try {
    const log = await db.notificationLog.create({ data: { kind, channel, referenceId, recipient, status: 'PENDING', provider: 'pending' } });
    logId = log.id;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const retried = await db.notificationLog.updateMany({
      where: { kind, channel, referenceId, status: 'FAILED' },
      data: { status: 'PENDING', recipient, error: null },
    });
    const existing = await db.notificationLog.findUniqueOrThrow({ where: { kind_channel_referenceId: { kind, channel, referenceId } } });
    if (retried.count !== 1) return { status: 'DUPLICATE', provider: existing.provider };
    logId = existing.id;
  }
  let result: ProviderResult;
  try { result = await send(); }
  catch (error) { result = { status: 'FAILED', provider: 'unknown', error: error instanceof Error ? error.message : 'Unknown error' }; }
  await db.notificationLog.update({ where: { id: logId }, data: { status: result.status, provider: result.provider, error: result.error ?? null } });
  return result;
}

export async function runDueOrderConfirmations(now = new Date()) {
  const settings = await getStoreSettings();
  const cutoff = new Date(now.getTime() - settings.confirmationDelayHours * 60 * 60 * 1000);
  const due = await db.order.findMany({
    where: { status: 'PENDING', paymentMethod: 'COD', createdAt: { lte: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, number: true, customerName: true, email: true, phone: true, total: true, orderCurrency: true, orderCurrencyTotal: true },
  });
  const results: { orderNumber: string; email: DeliveryResult; whatsapp: DeliveryResult }[] = [];
  for (const order of due) {
    const claim = await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
    if (claim.count !== 1) continue;
    const amount = order.orderCurrency === 'USD' ? `USD ${(order.orderCurrencyTotal / 100).toFixed(2)}` : `Rs ${order.total.toLocaleString('en-PK')}`;
    const text = `Assalam o Alaikum ${order.customerName}! Your ${settings.storeName} order #${order.number} (${amount}) has been confirmed and is being prepared. Thank you for shopping with us.`;
    const email = await deliverOnce('ORDER_CONFIRMATION', 'EMAIL', order.id, order.email, () => sendEmailMessage(order.email, `Order #${order.number} confirmed`, text));
    const whatsapp = await deliverOnce('ORDER_CONFIRMATION', 'WHATSAPP', order.id, order.phone, () => sendWhatsApp(order.phone, text));
    results.push({ orderNumber: order.number, email, whatsapp });
  }
  return { confirmed: results.length, delayHours: settings.confirmationDelayHours, results };
}

export class FeedbackError extends Error {}

export async function sendFeedbackRequest(lastDeliveredOrderId: string, now = new Date()) {
  const settings = await getStoreSettings();
  const order = await db.order.findUnique({ where: { id: lastDeliveredOrderId }, select: { id: true, status: true, customerName: true, phone: true, email: true, createdAt: true } });
  if (!order || order.status !== 'DELIVERED') throw new FeedbackError('This order is not a delivered order.');
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - settings.feedbackAfterMonths);
  if (order.createdAt > cutoff) throw new FeedbackError(`Feedback can only be requested ${settings.feedbackAfterMonths} months after the last delivered order.`);
  const key = customerKey(order.phone, order.email);
  const newer = await db.order.findMany({ where: { createdAt: { gt: order.createdAt }, status: { not: 'CANCELLED' } }, select: { phone: true, email: true } });
  if (newer.some(other => customerKey(other.phone, other.email) === key)) throw new FeedbackError('This customer has placed a newer order, so no feedback request is due.');
  const text = renderTemplate(settings.feedbackMessage, { name: order.customerName, store: settings.storeName });
  const result = await deliverOnce('FEEDBACK_REQUEST', 'WHATSAPP', order.id, order.phone, () => sendWhatsApp(order.phone, text));
  return { result, text, whatsappUrl: `https://wa.me/${whatsappDigits(order.phone)}?text=${encodeURIComponent(text)}` };
}
