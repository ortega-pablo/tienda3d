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

/**
 * Primer día del mes al que pertenece `date` **según la hora de pared
 * argentina**, expresado con el mismo formato de clave que ya usa
 * `CustomerMonthlyVolume.monthStart`: `YYYY-MM-01T00:00:00Z`.
 *
 * El bug que corrige: el cálculo anterior tomaba el mes en UTC. Como el
 * negocio opera en ART (UTC−3), una cotización aceptada entre las 21:00 y las
 * 23:59 del último día del mes ya era día 1 en UTC y se imputaba al mes
 * siguiente. Esos volúmenes alimentan el cumplimiento de compromiso mayorista,
 * así que un cliente podía quedar suspendido por ventas que sí hizo.
 *
 * El FORMATO de la clave no cambia a propósito: se sigue guardando el día 1 a
 * medianoche UTC. Si se guardara el instante real del inicio de mes argentino
 * (03:00Z) ninguna fila existente matchearía y se duplicarían los volúmenes.
 * Lo único que cambia es a QUÉ mes pertenece una fecha.
 */
export function startOfBusinessMonth(date: Date): Date {
  const wall = new Date(date.getTime() - AR_OFFSET_MS);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Suma (o resta) meses a un inicio de mes, sin desbordes de día.
 *
 * El bug que corrige: la versión anterior hacía `setUTCMonth(m - 1)` sobre la
 * fecha original. Si el día no existe en el mes destino, JS desborda hacia
 * adelante: el 31 de marzo menos un mes daba "31 de febrero" → 3 de marzo, y el
 * cierre mensual manual terminaba cerrando el mes en curso en vez del anterior.
 * Operar siempre sobre el día 1 lo hace imposible; `Date.UTC` normaliza sola el
 * cambio de año cuando el índice de mes se va de rango.
 */
export function addBusinessMonths(monthStart: Date, months: number): Date {
  return new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + months, 1, 0, 0, 0, 0),
  );
}
