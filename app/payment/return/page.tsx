'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/components/cart-context';

type Result = 'checking' | 'paid' | 'pending' | 'error';

export default function PaymentReturnPage() {
  const { clear } = useCart();
  const clearRef = useRef(clear);
  const [result, setResult] = useState<Result>('checking');
  const [orderNumber, setOrderNumber] = useState('');
  const [tracker, setTracker] = useState('');
  const [message, setMessage] = useState('Checking the payment securely with Safepay…');
  const [busy, setBusy] = useState(false);

  useEffect(() => { clearRef.current = clear; }, [clear]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const order = params.get('orderNumber') || '';
    const paymentTracker = params.get('tracker') || params.get('beacon') || '';
    setOrderNumber(order);
    setTracker(paymentTracker);
    if (!order || !paymentTracker) {
      setResult('error');
      setMessage('We could not find the Safepay payment reference. Please contact the store before placing the order again.');
      return;
    }
    let cancelled = false;
    fetch('/api/payments/confirm', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNumber: order, tracker: paymentTracker }),
    }).then(async response => {
      const data = await response.json();
      if (cancelled) return;
      if (response.ok && data.paymentStatus === 'PAID') {
        clearRef.current();
        setResult('paid');
        setMessage('Safepay confirmed your payment. Your order is now confirmed.');
      } else if (response.status === 202) {
        setResult('pending');
        setMessage(data.message || 'Safepay has not confirmed the payment yet. You can check again or retry payment.');
      } else {
        setResult('error');
        setMessage(data.error || 'We could not verify this payment. Please contact the store.');
      }
    }).catch(() => {
      if (!cancelled) { setResult('pending'); setMessage('Payment confirmation is taking longer than usual. Check again in a moment.'); }
    });
    return () => { cancelled = true; };
  }, []);

  async function checkAgain() {
    setBusy(true);
    try {
      const response = await fetch('/api/payments/confirm', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber, tracker }),
      });
      const data = await response.json();
      if (response.ok && data.paymentStatus === 'PAID') {
        clearRef.current(); setResult('paid'); setMessage('Safepay confirmed your payment. Your order is now confirmed.');
      } else if (response.status === 202) {
        setResult('pending'); setMessage(data.message || 'Safepay has not confirmed the payment yet.');
      } else {
        setResult('error'); setMessage(data.error || 'We could not verify this payment.');
      }
    } catch {
      setResult('pending'); setMessage('Payment confirmation is taking longer than usual. Check again in a moment.');
    } finally { setBusy(false); }
  }

  async function retryPayment() {
    setBusy(true);
    try {
      const response = await fetch('/api/payments/retry', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber, tracker }),
      });
      const data = await response.json();
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error || 'Safepay checkout could not be restarted.');
      window.location.assign(data.checkoutUrl);
    } catch (failure) {
      setResult('error'); setMessage(failure instanceof Error ? failure.message : 'Safepay checkout could not be restarted.'); setBusy(false);
    }
  }

  return <main className="page-wrap order-success payment-return">
    <span className="eyebrow">CARD PAYMENT · {result === 'paid' ? 'CONFIRMED' : result === 'checking' ? 'CHECKING' : 'PENDING'}</span>
    <h1>{result === 'paid' ? 'Payment received.' : result === 'checking' ? 'Checking your payment.' : 'Payment not confirmed yet.'}</h1>
    {orderNumber && <p>Order reference: <strong>{orderNumber}</strong></p>}
    <p>{message}</p>
    {result === 'pending' && <div className="payment-return-actions"><button className="button dark" onClick={checkAgain} disabled={busy}>{busy ? 'Checking…' : 'Check payment again'}</button><button className="button secondary" onClick={retryPayment} disabled={busy}>{busy ? 'Opening…' : 'Retry card payment'}</button></div>}
    {result === 'error' && tracker && orderNumber && <button className="button dark" onClick={checkAgain} disabled={busy}>{busy ? 'Checking…' : 'Check payment again'}</button>}
    <p><Link className="text-link" href={result === 'paid' ? '/' : '/cart'}>{result === 'paid' ? 'Continue shopping' : 'Return to shopping bag'}</Link></p>
  </main>;
}
