'use client';

import { useCallback, useEffect, useState } from 'react';
import { createXlsx, type XlsxSheet } from '@/lib/xlsx-export';

type OverviewData = {
  metrics: {
    totalOrders: number; paidSales: number; paidOrders: number; monthSales: number;
    monthPaidOrders: number; todayOrders: number; deliveryCharges: number;
    pendingCod: number; pendingCodOrders: number; returnCases: number;
    completedReturnCases: number; activeProducts: number; averagePaidOrder: number;
  };
  orderStatuses: { status: string; count: number; value: number }[];
  paymentStatuses: { status: string; count: number; value: number }[];
  currencySales: { currency: 'PKR' | 'USD'; paidOrders: number; paidAmountMinor: number; orderCount: number; orderValueMinor: number }[];
  internationalDestinations: { country: string; city: string; currency: 'PKR' | 'USD'; orderCount: number; orderValueMinor: number }[];
  dailySales: { date: string; label: string; sales: number; orders: number }[];
  recentOrders: { id: string; number: string; customerName: string; total: number; shipping: number; status: string; paymentStatus: string; returnStatus: string; orderType: string; createdAt: string }[];
  lowStock: { id: string; product: string; color: string | null; size: string | null; stock: number }[];
};

type ReportOrder = {
  number: string; customerName: string; city: string; country: string; orderType: string;
  orderCurrency: 'PKR' | 'USD'; orderCurrencySubtotal: number; orderCurrencyShipping: number;
  orderCurrencyDiscount: number; orderCurrencyTotal: number; subtotal: number; shipping: number;
  discount: number; total: number; status: string; paymentMethod: string; paymentStatus: string;
  paidCurrency: 'PKR' | 'USD' | null; paidAmountMinor: number | null; returnStatus: string;
  createdAt: string; items: { productName: string; quantity: number; color: string | null; size: string | null }[];
};
type SalesReport = { start: string; end: string; timeZone: string; orders: ReportOrder[] };
type ReportPreset = 'week' | 'month' | 'custom';

function pakistanDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function reportDates(preset: ReportPreset, customStart: string, customEnd: string) {
  const today = pakistanDate();
  if (preset === 'month') return { start: `${today.slice(0, 7)}-01`, end: today };
  if (preset === 'week') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { start: shiftDate(today, -((weekday + 6) % 7)), end: today };
  }
  return { start: customStart, end: customEnd };
}

function amount(value: number, currency: 'PKR' | 'USD') {
  return currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100)
    : `PKR ${new Intl.NumberFormat('en-PK').format(value)}`;
}

function reportSummary(orders: ReportOrder[]) {
  const active = orders.filter(order => order.status !== 'CANCELLED');
  const sum = (rows: ReportOrder[], getValue: (order: ReportOrder) => number) => rows.reduce((total, order) => total + getValue(order), 0);
  const paid = orders.filter(order => order.paymentStatus === 'PAID' && order.paidCurrency && order.paidAmountMinor !== null);
  const pendingCod = active.filter(order => order.paymentMethod === 'COD' && order.paymentStatus === 'UNPAID' && !['RECEIVED', 'REFUNDED'].includes(order.returnStatus));
  const returns = orders.filter(order => order.returnStatus !== 'NONE');
  return {
    count: orders.length,
    orderCountPkr: active.filter(order => order.orderCurrency === 'PKR').length,
    orderCountUsd: active.filter(order => order.orderCurrency === 'USD').length,
    cancelledCount: orders.filter(order => order.status === 'CANCELLED').length,
    returns: returns.length,
    paidPkr: sum(paid.filter(order => order.paidCurrency === 'PKR'), order => order.paidAmountMinor || 0),
    paidUsd: sum(paid.filter(order => order.paidCurrency === 'USD'), order => order.paidAmountMinor || 0),
    orderPkr: sum(active.filter(order => order.orderCurrency === 'PKR'), order => order.orderCurrencyTotal),
    orderUsd: sum(active.filter(order => order.orderCurrency === 'USD'), order => order.orderCurrencyTotal),
    deliveryPkr: sum(active.filter(order => order.orderCurrency === 'PKR'), order => order.orderCurrencyShipping),
    deliveryUsd: sum(active.filter(order => order.orderCurrency === 'USD'), order => order.orderCurrencyShipping),
    codPkr: sum(pendingCod.filter(order => order.orderCurrency === 'PKR'), order => order.orderCurrencyTotal),
    codUsd: sum(pendingCod.filter(order => order.orderCurrency === 'USD'), order => order.orderCurrencyTotal),
  };
}

function createSalesSheets(report: SalesReport): XlsxSheet[] {
  const summary = reportSummary(report.orders);
  const summaryRows: (string | number | null)[][] = [
    ['AS COLLECTION · SALES SUMMARY'],
    ['Report period (Pakistan time)', `${report.start} to ${report.end}`],
    [],
    ['Metric', 'PKR', 'USD'],
    ['Non-cancelled orders', summary.orderCountPkr, summary.orderCountUsd],
    ['Total order value · excluding cancelled', summary.orderPkr, summary.orderUsd / 100],
    ['Sales collected · paid orders only', summary.paidPkr, summary.paidUsd / 100],
    ['Delivery charged · excluding cancelled', summary.deliveryPkr, summary.deliveryUsd / 100],
    ['Unpaid COD outstanding', summary.codPkr, summary.codUsd / 100],
    ['Return cases', summary.returns, null],
    ['Cancelled orders', summary.cancelledCount, null],
    [],
    ['How to read this report'],
    ['PKR and USD are shown in separate columns. USD order amounts are shown in dollars, not cents. Order counts exclude cancelled orders.'],
    ['Sales collected counts only orders marked PAID. Unpaid COD appears separately as outstanding.'],
    ['Order value and delivery exclude cancelled orders. Return cases count orders with any return status.'],
  ];
  const summaryStyles: Record<number, Record<number, number>> = {
    0: { 0: 1 },
    3: { 0: 2, 1: 2, 2: 2 },
    4: { 0: 6, 1: 6, 2: 6 },
    5: { 0: 7, 1: 7, 2: 8 },
    6: { 0: 7, 1: 7, 2: 8 },
    7: { 0: 6, 1: 4, 2: 5 },
    8: { 0: 6, 1: 4, 2: 5 },
    9: { 0: 6, 1: 6 },
    10: { 0: 6, 1: 6 },
    12: { 0: 2 },
    13: { 0: 3 },
    14: { 0: 3 },
    15: { 0: 3 },
  };
  const detailsHeader = ['Order date · PKT', 'Order reference', 'Customer', 'City', 'Country', 'Order type', 'Items', 'Order currency', 'Subtotal · order currency', 'Delivery · order currency', 'Discount · order currency', 'Order total · order currency', 'Subtotal · PKR', 'Delivery · PKR', 'Discount · PKR', 'Total · PKR', 'Payment method', 'Payment status', 'Paid currency', 'Collected amount · paid currency', 'Order status', 'Return status'];
  const orderRows: (string | number | null)[][] = [
    ['AS COLLECTION · ORDER DETAILS'],
    ['Report period (Pakistan time)', `${report.start} to ${report.end}`],
    [],
    detailsHeader,
    ...report.orders.map(order => [
      new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }).format(new Date(order.createdAt)),
      order.number, order.customerName, order.city, order.country, order.orderType,
      order.items.map(item => `${item.productName} × ${item.quantity}${item.color ? ` · ${item.color}` : ''}${item.size ? ` · ${item.size}` : ''}`).join('; '),
      order.orderCurrency,
      order.orderCurrency === 'USD' ? order.orderCurrencySubtotal / 100 : order.orderCurrencySubtotal,
      order.orderCurrency === 'USD' ? order.orderCurrencyShipping / 100 : order.orderCurrencyShipping,
      order.orderCurrency === 'USD' ? order.orderCurrencyDiscount / 100 : order.orderCurrencyDiscount,
      order.orderCurrency === 'USD' ? order.orderCurrencyTotal / 100 : order.orderCurrencyTotal,
      order.subtotal, order.shipping, order.discount, order.total, order.paymentMethod, order.paymentStatus,
      order.paidCurrency, order.paidAmountMinor === null ? '' : order.paidCurrency === 'USD' ? order.paidAmountMinor / 100 : order.paidAmountMinor,
      order.status, order.returnStatus,
    ]),
  ];
  const orderStyles: Record<number, Record<number, number>> = { 0: { 0: 1 }, 3: Object.fromEntries(detailsHeader.map((_, index) => [index, 2])) };
  for (let rowIndex = 4; rowIndex < orderRows.length; rowIndex++) {
    orderStyles[rowIndex] ??= {};
    const currency = orderRows[rowIndex][7];
    for (const columnIndex of [8, 9, 10, 11]) orderStyles[rowIndex][columnIndex] = currency === 'USD' ? 5 : 4;
    for (const columnIndex of [12, 13, 14, 15]) orderStyles[rowIndex][columnIndex] = 4;
    if (orderRows[rowIndex][18] === 'USD') orderStyles[rowIndex][19] = 5;
    else if (orderRows[rowIndex][18] === 'PKR') orderStyles[rowIndex][19] = 4;
  }
  return [
    { name: 'Summary', rows: summaryRows, widths: [48, 22, 22], freezeRows: 4, mergeCells: ['A1:C1', 'B2:C2', 'A13:C13', 'A14:C14', 'A15:C15', 'A16:C16'], cellStyles: summaryStyles },
    { name: 'Orders', rows: orderRows, widths: [22, 34, 26, 18, 20, 15, 60, 16, 24, 23, 23, 24, 20, 19, 19, 18, 18, 18, 16, 30, 18, 18], freezeRows: 4, filterRange: `A4:V${Math.max(4, orderRows.length)}`, mergeCells: ['A1:V1', 'B2:V2'], cellStyles: orderStyles },
  ];
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function createPrintHtml(report: SalesReport) {
  const summary = reportSummary(report.orders);
  const summaryRows = [
    ['Orders placed', String(summary.count)], ['Paid collection · PKR', amount(summary.paidPkr, 'PKR')], ['Paid collection · USD', amount(summary.paidUsd, 'USD')],
    ['Order value · PKR · excluding cancelled', amount(summary.orderPkr, 'PKR')], ['Order value · USD · excluding cancelled', amount(summary.orderUsd, 'USD')],
    ['Delivery charged · PKR · excluding cancelled', amount(summary.deliveryPkr, 'PKR')], ['Delivery charged · USD · excluding cancelled', amount(summary.deliveryUsd, 'USD')],
    ['Unpaid COD · PKR', amount(summary.codPkr, 'PKR')], ['Unpaid COD · USD', amount(summary.codUsd, 'USD')], ['Return cases', String(summary.returns)],
  ];
  const detailRows = report.orders.map(order => {
    const items = order.items.map(item => `${item.productName} × ${item.quantity}${item.color ? ` · ${item.color}` : ''}${item.size ? ` · ${item.size}` : ''}`).join('; ');
    const paid = order.paidAmountMinor === null || !order.paidCurrency ? '—' : amount(order.paidAmountMinor, order.paidCurrency);
    const orderTotal = amount(order.orderCurrencyTotal, order.orderCurrency);
    const shipping = amount(order.orderCurrencyShipping, order.orderCurrency);
    const placed = new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeZone: 'Asia/Karachi' }).format(new Date(order.createdAt));
    return `<tr><td>${escapeHtml(placed)}</td><td>${escapeHtml(order.number)}</td><td>${escapeHtml(order.customerName)}</td><td>${escapeHtml(items)}</td><td>${escapeHtml([order.city, order.country].filter(Boolean).join(', '))}</td><td>${escapeHtml(order.orderType)}</td><td>${escapeHtml(orderTotal)}</td><td>${escapeHtml(shipping)}</td><td>${escapeHtml(paid)}</td><td>${escapeHtml(order.paymentStatus)}</td><td>${escapeHtml(order.status)}</td><td>${escapeHtml(order.returnStatus)}</td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>AS Collection Sales Report</title><style>
    *{box-sizing:border-box}body{font:12px/1.45 Arial,sans-serif;color:#24221f;margin:28px}header{border-bottom:2px solid #a88752;padding-bottom:14px;margin-bottom:18px}header small{letter-spacing:.2em;color:#a88752;font-weight:700}h1{font:32px Georgia,serif;margin:8px 0}p{color:#666;margin:4px 0}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0 24px}.summary div{border:1px solid #e9e5de;padding:9px}.summary strong{display:block;font:16px Georgia,serif;margin-top:4px}.summary span{font-size:10px;color:#666}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#f2eee7;text-align:left;color:#5a4930}th,td{border:1px solid #e4ded4;padding:6px;vertical-align:top;overflow-wrap:anywhere}footer{margin-top:18px;color:#777;font-size:9px}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}.summary{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}button{display:none}}
    </style></head><body><header><small>AS COLLECTION · STORE MANAGEMENT</small><h1>Sales report</h1><p>From ${escapeHtml(report.start)} to ${escapeHtml(report.end)} · Pakistan Standard Time</p></header><div class="summary">${summaryRows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div><table><thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Items</th><th>Destination</th><th>Type</th><th>Order total</th><th>Delivery</th><th>Collected</th><th>Payment</th><th>Status</th><th>Return</th></tr></thead><tbody>${detailRows || '<tr><td colspan="12">No orders in this date range.</td></tr>'}</tbody></table><footer>Paid collection is grouped by the currency actually received. Order totals and delivery are reported in the currency chosen when the order was placed.</footer></body></html>`;
}

const money = (value: number) => `PKR ${new Intl.NumberFormat('en-PK').format(value || 0)}`;
const currencyMoney = (minor: number, currency: 'PKR' | 'USD') => currency === 'USD'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((minor || 0) / 100)
  : money(minor);
const date = (value: string) => new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }).format(new Date(value));

export default function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reportPreset, setReportPreset] = useState<ReportPreset>('month');
  const [customStart, setCustomStart] = useState(() => `${pakistanDate().slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(() => pakistanDate());
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/overview', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Admin session expired. Sign in again.' : 'Could not load dashboard data.');
      setData(await response.json());
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load dashboard data.'); }
    finally { setLoading(false); }
  }, []);
  const refresh = () => { setLoading(true); void load(); };

  async function fetchSalesReport() {
    const dates = reportDates(reportPreset, customStart, customEnd);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dates.start) || !/^\d{4}-\d{2}-\d{2}$/.test(dates.end) || dates.start > dates.end) {
      throw new Error('Choose a valid date range, with the end date on or after the start date.');
    }
    const response = await fetch(`/api/admin/reports/orders?start=${encodeURIComponent(dates.start)}&end=${encodeURIComponent(dates.end)}`, { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not create the sales report.');
    return result as SalesReport;
  }

  async function downloadExcel() {
    setExporting('excel');
    setExportError('');
    try {
      const report = await fetchSalesReport();
      const workbook = createXlsx(createSalesSheets(report));
      const blob = new Blob([workbook.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `AS-Collection-sales-${report.start}-to-${report.end}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Could not download the spreadsheet.'); }
    finally { setExporting(null); }
  }

  async function downloadPdf() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setExportError('Allow pop-ups for this site to open the PDF print window.'); return; }
    printWindow.opener = null;
    printWindow.document.write('<!doctype html><title>Preparing sales report…</title><p style="font:16px Arial;padding:24px">Preparing your sales report…</p>');
    printWindow.document.close();
    setExporting('pdf');
    setExportError('');
    try {
      const report = await fetchSalesReport();
      printWindow.document.open();
      printWindow.document.write(createPrintHtml(report));
      printWindow.document.close();
      window.setTimeout(() => { if (!printWindow.closed) { printWindow.focus(); printWindow.print(); } }, 500);
    } catch (cause) {
      printWindow.close();
      setExportError(cause instanceof Error ? cause.message : 'Could not prepare the PDF report.');
    } finally { setExporting(null); }
  }

  useEffect(() => {
    let active = true;
    fetch('/api/admin/overview', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 401 ? 'Admin session expired. Sign in again.' : 'Could not load dashboard data.');
        return response.json() as Promise<OverviewData>;
      })
      .then(result => { if (active) { setData(result); setError(''); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load dashboard data.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading && !data) return <section className="admin-card"><p>Loading store overview…</p></section>;
  if (error && !data) return <section className="admin-card"><p className="error-note">{error}</p><button className="button" onClick={() => void refresh()}>Try again</button></section>;
  if (!data) return null;
  const { metrics } = data;
  const maxSales = Math.max(1, ...data.dailySales.map(day => day.sales));
  const cards = [
    ['Paid sales · PKR', money(metrics.paidSales), `${metrics.paidOrders} paid orders collected in PKR`],
    ['This month · PKR', money(metrics.monthSales), `${metrics.monthPaidOrders} paid orders collected in PKR`],
    ['All orders', metrics.totalOrders.toLocaleString('en-PK'), `${metrics.todayOrders} placed today`],
    ['Delivery collected', money(metrics.deliveryCharges), 'Shipping charged on non-cancelled orders'],
    ['COD to collect', money(metrics.pendingCod), `${metrics.pendingCodOrders} unpaid COD orders`],
    ['Return cases', metrics.returnCases.toLocaleString('en-PK'), `${metrics.completedReturnCases} received/refunded`],
  ];

  return <div className="admin-overview">
    <div className="admin-overview-heading"><div><span className="eyebrow">STORE PERFORMANCE</span><h2>Overview</h2><p>Live figures from orders saved in your store database.</p></div><button className="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <section className="admin-panel admin-export-panel"><div className="admin-panel-heading"><div><span className="eyebrow">SALES REPORT</span><h3>Export orders and sales</h3><p>Choose a period. Excel download opens in Excel; PDF opens the print dialog where you can select “Save as PDF”.</p></div></div>
      <div className="admin-export-controls"><label className="field-label">Date range<select value={reportPreset} onChange={event => setReportPreset(event.target.value as ReportPreset)}><option value="week">This week · Monday to today</option><option value="month">This month</option><option value="custom">Custom dates</option></select></label>
        {reportPreset === 'custom' && <><label className="field-label">From<input type="date" value={customStart} onChange={event => setCustomStart(event.target.value)}/></label><label className="field-label">To<input type="date" value={customEnd} min={customStart} onChange={event => setCustomEnd(event.target.value)}/></label></>}
        <div className="admin-export-buttons"><button className="button dark" onClick={() => void downloadExcel()} disabled={exporting !== null}>{exporting === 'excel' ? 'Preparing…' : 'Download Excel (.xlsx)'}</button><button className="button" onClick={() => void downloadPdf()} disabled={exporting !== null}>{exporting === 'pdf' ? 'Preparing…' : 'Download PDF'}</button></div>
      </div>
      {exportError && <p className="error-note" role="status">{exportError}</p>}
      <p className="admin-footnote">Report includes order details, item names, delivery, discounts, payment and return status. PKR and USD figures stay separate. Contact details and full addresses are not included.</p>
    </section>
    {error && <p className="error-note">{error}</p>}
    <div className="admin-metric-grid">{cards.map(([label, value, hint]) => <article className="admin-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</div>

    <section className="admin-panel admin-currency-panel"><div className="admin-panel-heading"><div><span className="eyebrow">CURRENCY REPORT</span><h3>Sales and orders by currency</h3></div></div>
      <div className="admin-currency-grid">{data.currencySales.map(item => <article className="admin-currency-card" key={item.currency}><span>Actually collected · {item.currency}</span><strong>{currencyMoney(item.paidAmountMinor, item.currency)}</strong><small>{item.paidOrders} paid orders</small><div><span>Orders priced in {item.currency}</span><b>{item.orderCount} · {currencyMoney(item.orderValueMinor, item.currency)}</b></div></article>)}</div>
      <p className="admin-footnote">Collected totals use the currency recorded when an order is marked paid. Order value uses the currency shown when it was placed. COD and the current Safepay setup are collected in PKR; USD collected stays separate when recorded in Orders.</p>
    </section>

    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">FOREIGN DESTINATIONS</span><h3>Orders by country and city</h3></div></div>
      {data.internationalDestinations.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Country</th><th>City</th><th>Price currency</th><th>Orders</th><th>Order value</th></tr></thead><tbody>{data.internationalDestinations.map((item, index) => <tr key={`${item.country}-${item.city}-${item.currency}-${index}`}><td>{item.country}</td><td>{item.city}</td><td>{item.currency}</td><td>{item.orderCount}</td><td>{currencyMoney(item.orderValueMinor, item.currency)}</td></tr>)}</tbody></table></div> : <p className="admin-footnote">No non-Pakistan destinations recorded yet. Country and city entered at checkout will appear here.</p>}
    </section>

    <div className="admin-overview-grid">
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">LAST 7 DAYS</span><h3>Paid sales</h3></div><span className="admin-panel-total">{money(data.dailySales.reduce((sum, day) => sum + day.sales, 0))}</span></div>
        <div className="admin-sales-chart" role="img" aria-label="Paid sales for the last seven days">{data.dailySales.map(day => <div className="admin-sales-day" key={day.date} title={`${day.label}: ${money(day.sales)} · ${day.orders} orders`}><div className="admin-sales-track"><span style={{ height: `${Math.max(day.sales ? 6 : 2, day.sales / maxSales * 100)}%` }} /></div><small>{day.label}</small></div>)}</div>
        <p className="admin-footnote">Sales include orders marked PAID. Mark delivered COD orders as PAID in Orders after you collect cash.</p>
      </section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">FULFILMENT</span><h3>Order status</h3></div><span className="admin-panel-total">{money(metrics.averagePaidOrder)} <small>avg paid order</small></span></div>
        {data.orderStatuses.length ? <div className="admin-status-list">{data.orderStatuses.map(item => <div className="admin-status-row" key={item.status}><span className="admin-status-dot" data-status={item.status} /><strong>{item.status.replaceAll('_', ' ')}</strong><span>{item.count}</span><small>{money(item.value)}</small></div>)}</div> : <p className="admin-footnote">No orders yet.</p>}
      </section>
    </div>

    <div className="admin-overview-grid">
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>Latest orders</h3></div></div>
        {data.recentOrders.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Payment</th></tr></thead><tbody>{data.recentOrders.map(order => <tr key={order.id}><td><strong>{order.number}</strong><small>{date(order.createdAt)}</small></td><td>{order.customerName}<small>{order.orderType}</small></td><td>{money(order.total)}<small>Delivery {money(order.shipping)}</small></td><td><span className="admin-pill">{order.status}</span></td><td><span className="admin-pill">{order.paymentStatus}</span></td></tr>)}</tbody></table></div> : <p className="admin-footnote">Your first customer orders will appear here.</p>}
      </section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">INVENTORY</span><h3>Low stock</h3></div><span className="admin-panel-total">{metrics.activeProducts} <small>active products</small></span></div>
        {data.lowStock.length ? <div className="admin-stock-list">{data.lowStock.map(item => <div key={item.id}><span><strong>{item.product}</strong><small>{[item.color, item.size].filter(Boolean).join(' · ') || 'Default variant'}</small></span><b className={item.stock === 0 ? 'out-of-stock' : ''}>{item.stock} left</b></div>)}</div> : <p className="admin-footnote">No variants have 5 or fewer pieces in stock.</p>}
      </section>
    </div>
    <p className="admin-footnote admin-definitions">Paid sales are recorded order totals, including delivery charges. Delivery collected is shown separately for breakdown and is not courier cost/profit. COD to collect excludes cancelled and completed return orders.</p>
  </div>;
}
