/**
 * Utilidades de fecha ancladas a la zona horaria de Argentina (GMT-3, sin DST).
 * TODAS las fechas que se imprimen en documentos o se muestran deben usar estos
 * helpers para no depender de la TZ del servidor (que puede ser UTC).
 */

export const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';
/** Offset fijo de Argentina respecto de UTC (sin horario de verano). */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Fecha (dd/mm/aaaa) en es-AR, SIEMPRE en zona horaria de Argentina. */
export function formatDateAr(d: Date): string {
  return d.toLocaleDateString('es-AR', { timeZone: AR_TIMEZONE });
}

/** Fecha y hora en es-AR, SIEMPRE en zona horaria de Argentina. */
export function formatDateTimeAr(d: Date): string {
  return d.toLocaleString('es-AR', { timeZone: AR_TIMEZONE });
}

/**
 * Suma `businessDays` días hábiles (lunes a viernes) a `from`, contando sobre
 * el día "de pared" en Argentina para que el corte de fin de semana sea
 * correcto sin importar la TZ del servidor. NO excluye feriados nacionales
 * (solo sábados y domingos). El resultado se fija al mediodía de Argentina
 * para que al formatear no corra de día.
 */
export function addBusinessDays(from: Date, businessDays: number): Date {
  // Representamos el día AR de `from` como una fecha cuyo UTC coincide con la
  // pared argentina (restando el offset).
  const wall = new Date(from.getTime() - AR_OFFSET_MS);
  let added = 0;
  while (added < businessDays) {
    wall.setUTCDate(wall.getUTCDate() + 1);
    const dow = wall.getUTCDay(); // 0 = domingo, 6 = sábado
    if (dow !== 0 && dow !== 6) added += 1;
  }
  // Mediodía de Argentina = 15:00 UTC del día alcanzado.
  wall.setUTCHours(15, 0, 0, 0);
  return wall;
}
