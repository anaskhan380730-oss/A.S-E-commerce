'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { money, type DisplayCurrency } from '@/lib/money';
import { parseInternationalCountries } from '@/lib/shipping';

type CurrencySettings = {
  currency: DisplayCurrency;
  usdToPkrRate: number;
  wholesaleUsdPriceCents: number | null;
  formatPrice: (amountPkr: number, usdPriceCents?: number | null) => string;
};

const defaultCurrency: CurrencySettings = {
  currency: 'PKR',
  usdToPkrRate: 280,
  wholesaleUsdPriceCents: null,
  formatPrice: amount => money(amount),
};

const CurrencyContext = createContext<CurrencySettings>(defaultCurrency);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<DisplayCurrency>('PKR');
  const [usdToPkrRate, setUsdToPkrRate] = useState(280);
  const [wholesaleUsdPriceCents, setWholesaleUsdPriceCents] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      fetch('/api/settings', { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(settings => {
          if (!active || !settings) return;
          setCurrency(settings.displayCurrency === 'USD' ? 'USD' : 'PKR');
          setUsdToPkrRate(Number(settings.usdToPkrRate) > 0 ? Number(settings.usdToPkrRate) : 280);
          setWholesaleUsdPriceCents(Number.isInteger(settings.wholesaleUsdPriceCents) ? settings.wholesaleUsdPriceCents : null);
        })
        .catch(() => {});
    };
    const initialRefresh = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 60_000);
    const onSameTabUpdate = () => refresh();
    const onLocalUpdate = (event: StorageEvent) => { if (event.key === 'as-currency-settings-updated') refresh(); };
    window.addEventListener('storage', onLocalUpdate);
    window.addEventListener('as-currency-settings-updated', onSameTabUpdate);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearTimeout(initialRefresh); window.clearInterval(timer); window.removeEventListener('storage', onLocalUpdate); window.removeEventListener('as-currency-settings-updated', onSameTabUpdate); window.removeEventListener('focus', refresh); };
  }, []);

  const value: CurrencySettings = {
    currency,
    usdToPkrRate,
    wholesaleUsdPriceCents,
    formatPrice: (amount, overrideCents) => money(amount, currency, usdToPkrRate, overrideCents),
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function CurrencyNotice() {
  const { currency } = useCurrency();
  const [internationalCountries, setInternationalCountries] = useState('');
  const [internationalCheckoutReady, setInternationalCheckoutReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/settings', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(settings => {
      if (!active || !settings) return;
      setInternationalCountries(parseInternationalCountries(settings.internationalCountries).join(', '));
      setInternationalCheckoutReady(Boolean(settings.internationalShippingEnabled && settings.cardPaymentsEnabled && settings.cardPaymentEnvironment === 'production'));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (currency !== 'USD') return null;
  const message = internationalCheckoutReady
    ? `International delivery is available to ${internationalCountries}. Cash on Delivery is available only in Pakistan.`
    : 'USD prices are for reference only. International orders are not open until the live card gateway and shipping are ready.';
  return <aside className="currency-notice" role="note">{message}</aside>;
}
