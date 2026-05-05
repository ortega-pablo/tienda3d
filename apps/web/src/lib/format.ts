const moneyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export function formatMoney(value: number, currency = 'ARS'): string {
  if (currency === 'ARS') return moneyFormatter.format(value);
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${numberFormatter.format(value)}%`;
}
