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

/**
 * Zona horaria de Argentina (GMT-3). TODAS las fechas mostradas en el sistema
 * usan esta TZ para no depender de la zona del navegador (evita el corrimiento
 * de un día en fechas guardadas como medianoche UTC).
 */
const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';

type DateInput = string | number | Date | null | undefined;

/** Fecha (dd/mm/aaaa) en es-AR, SIEMPRE en zona horaria de Argentina. */
export function formatDate(value: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  if (value == null || value === '') return '';
  return new Date(value).toLocaleDateString('es-AR', { timeZone: AR_TIMEZONE, ...opts });
}

/** Fecha y hora en es-AR, SIEMPRE en zona horaria de Argentina. */
export function formatDateTime(value: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  if (value == null || value === '') return '';
  return new Date(value).toLocaleString('es-AR', { timeZone: AR_TIMEZONE, ...opts });
}
