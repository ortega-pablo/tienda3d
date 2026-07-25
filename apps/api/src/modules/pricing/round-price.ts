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
  return Math.ceil(value / step) * step;
}
