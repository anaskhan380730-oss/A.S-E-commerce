export function parseInternationalCountries(value: string | null | undefined) {
  return [...new Set((value || '')
    .split(',')
    .map(country => country.trim().replace(/\s+/g, ' '))
    .filter(country => country && country.toLowerCase() !== 'pakistan'))];
}

export function isPakistan(country: string) {
  return country.trim().replace(/\s+/g, ' ').toLowerCase() === 'pakistan';
}

export function isAllowedInternationalCountry(country: string, configuredCountries: string | null | undefined) {
  const normalizedCountry = country.trim().replace(/\s+/g, ' ').toLowerCase();
  return !!normalizedCountry && parseInternationalCountries(configuredCountries)
    .some(allowed => allowed.toLowerCase() === normalizedCountry);
}

export function internationalShippingError(country: string, settings: {
  internationalShippingEnabled: boolean;
  internationalCountries: string;
  internationalDeliveryFeeUsdCents: number | null;
}) {
  if (isPakistan(country)) return null;
  if (!settings.internationalShippingEnabled) return 'International delivery is not open yet. Please choose Pakistan for delivery.';
  if (!isAllowedInternationalCountry(country, settings.internationalCountries)) return 'We do not currently deliver to this country.';
  if (settings.internationalDeliveryFeeUsdCents === null) return 'International delivery pricing is not configured yet. Please contact the store.';
  return null;
}
