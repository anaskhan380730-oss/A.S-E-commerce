import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function pakistanDayKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function pakistanStartOfDay(date = new Date()) {
  return new Date(`${pakistanDayKey(date)}T00:00:00+05:00`);
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const todayStart = pakistanStartOfDay(now);
  const monthStart = new Date(`${pakistanDayKey(now).slice(0, 7)}-01T00:00:00+05:00`);
  const firstChartDay = new Date(todayStart);
  firstChartDay.setUTCDate(firstChartDay.getUTCDate() - 6);
  const returnInProgress = ['REQUESTED', 'APPROVED'];
  const returnCompleted = ['RECEIVED', 'REFUNDED'];

  const [totalOrders, paid, monthPaid, paidByCurrency, ordersByCurrency, internationalOrders, todayOrders, deliveryCharges, pendingCod, statuses, payments, returns, chartOrders, recentOrders, productCount, lowStock] = await Promise.all([
    db.order.count(),
    db.order.aggregate({ where: { paymentStatus: 'PAID', paidCurrency: 'PKR' }, _sum: { paidAmountMinor: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { paymentStatus: 'PAID', paidCurrency: 'PKR', createdAt: { gte: monthStart } }, _sum: { paidAmountMinor: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['paidCurrency'], where: { paymentStatus: 'PAID', paidCurrency: { not: null } }, _sum: { paidAmountMinor: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['orderCurrency'], where: { status: { not: 'CANCELLED' } }, _sum: { orderCurrencyTotal: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['country', 'city', 'orderCurrency'], where: { country: { not: 'Pakistan' }, status: { not: 'CANCELLED' } }, _sum: { orderCurrencyTotal: true }, _count: { _all: true } }),
    db.order.count({ where: { createdAt: { gte: todayStart } } }),
    db.order.aggregate({ where: { status: { not: 'CANCELLED' } }, _sum: { shipping: true } }),
    db.order.aggregate({ where: { paymentMethod: 'COD', paymentStatus: 'UNPAID', status: { not: 'CANCELLED' }, returnStatus: { notIn: returnCompleted } }, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ['status'], _count: { _all: true }, _sum: { total: true } }),
    db.order.groupBy({ by: ['paymentStatus'], _count: { _all: true }, _sum: { total: true } }),
    db.order.groupBy({ by: ['returnStatus'], _count: { _all: true }, _sum: { total: true } }),
    db.order.findMany({ where: { paymentStatus: 'PAID', paidCurrency: 'PKR', createdAt: { gte: firstChartDay } }, select: { createdAt: true, paidAmountMinor: true } }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, number: true, customerName: true, total: true, shipping: true, status: true, paymentStatus: true, returnStatus: true, orderType: true, orderCurrency: true, orderCurrencyTotal: true, country: true, city: true, createdAt: true } }),
    db.product.count({ where: { active: true } }),
    db.variant.findMany({ where: { active: true, stock: { lte: 5 } }, orderBy: { stock: 'asc' }, take: 8, select: { id: true, color: true, size: true, stock: true, product: { select: { name: true } } } }),
  ]);

  const paidSales = paid._sum.paidAmountMinor || 0;
  const paidCurrencyGroups = Object.fromEntries(paidByCurrency.map(group => [group.paidCurrency, { orders: group._count._all, value: group._sum.paidAmountMinor || 0 }]));
  const orderCurrencyGroups = Object.fromEntries(ordersByCurrency.map(group => [group.orderCurrency, { orders: group._count._all, value: group._sum.orderCurrencyTotal || 0 }]));
  const currencySales = ['PKR', 'USD'].map(currency => ({
    currency,
    paidOrders: paidCurrencyGroups[currency]?.orders || 0,
    paidAmountMinor: paidCurrencyGroups[currency]?.value || 0,
    orderCount: orderCurrencyGroups[currency]?.orders || 0,
    orderValueMinor: orderCurrencyGroups[currency]?.value || 0,
  }));
  const destinations = internationalOrders
    .map(group => ({ country: group.country, city: group.city, currency: group.orderCurrency, orderCount: group._count._all, orderValueMinor: group._sum.orderCurrencyTotal || 0 }))
    .sort((a, b) => b.orderCount - a.orderCount || a.country.localeCompare(b.country) || a.city.localeCompare(b.city))
    .slice(0, 30);
  const returnGroups = Object.fromEntries(returns.map(group => [group.returnStatus, { count: group._count._all, value: group._sum.total || 0 }]));
  const returnCases = returnInProgress.reduce((sum, key) => sum + (returnGroups[key]?.count || 0), 0)
    + returnCompleted.reduce((sum, key) => sum + (returnGroups[key]?.count || 0), 0);
  const completedReturnCases = returnCompleted.reduce((sum, key) => sum + (returnGroups[key]?.count || 0), 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstChartDay);
    date.setUTCDate(date.getUTCDate() + index);
    const key = pakistanDayKey(date);
    const sales = chartOrders.filter(order => pakistanDayKey(order.createdAt) === key);
    return { date: key, label: new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', weekday: 'short' }).format(date), sales: sales.reduce((sum, order) => sum + (order.paidAmountMinor || 0), 0), orders: sales.length };
  });

  return NextResponse.json({
    metrics: {
      totalOrders,
      paidSales,
      paidOrders: paid._count._all,
      monthSales: monthPaid._sum.paidAmountMinor || 0,
      monthPaidOrders: monthPaid._count._all,
      todayOrders,
      deliveryCharges: deliveryCharges._sum.shipping || 0,
      pendingCod: pendingCod._sum.total || 0,
      pendingCodOrders: pendingCod._count._all,
      returnCases,
      completedReturnCases,
      activeProducts: productCount,
      averagePaidOrder: paid._count._all ? Math.round(paidSales / paid._count._all) : 0,
    },
    currencySales,
    internationalDestinations: destinations,
    orderStatuses: statuses.map(group => ({ status: group.status, count: group._count._all, value: group._sum.total || 0 })),
    paymentStatuses: payments.map(group => ({ status: group.paymentStatus, count: group._count._all, value: group._sum.total || 0 })),
    dailySales: days,
    recentOrders,
    lowStock: lowStock.map(variant => ({ id: variant.id, product: variant.product.name, color: variant.color, size: variant.size, stock: variant.stock })),
  });
}
