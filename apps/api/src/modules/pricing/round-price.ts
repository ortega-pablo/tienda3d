/**
 * Redondea un precio de venta HACIA ARRIBA al siguiente múltiplo de `step`.
 *
 * Solo se aplica a valores de venta finales al cliente — nunca a costos ni a
 * datos intermedios (márgenes, netPrice, profit quedan exactos). Como siempre
 * redondea hacia arriba, el excedente (≤ step) es una diferencia a favor no
 * contabilizada como margen.
 *
 * - `step <= 0` → desactivado, devuelve el valor exacto.
 * - `value <= 0` → sin cambios (no "sube" un 0 ni un negativo por descuento).
 * - Un valor que ya es múltiplo de `step` queda igual (ceil idempotente).
 */
export function roundPriceUp(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  if (!Number.isFinite(value) || value <= 0) return value;

  const quotient = value / step;
  const nearest = Math.round(quotient);
  // Tolerancia relativa: si el cociente está a distancia de error de punto
  // flotante de un entero, el "excedente" no es un precio mayor sino ruido de
  // la división. Sin esto, `roundPriceUp(3000.0000000000005, 100)` devolvía
  // 3100 — un paso entero de más sobre un valor que ya era múltiplo. Ese tipo
  // de valor sale naturalmente de `netPrice × 1.21` cuando netPrice viene de
  // una división.
  const tolerance = Math.abs(quotient) * Number.EPSILON * 8;
  if (Math.abs(quotient - nearest) <= tolerance) return nearest * step;

  return Math.ceil(quotient) * step;
}
