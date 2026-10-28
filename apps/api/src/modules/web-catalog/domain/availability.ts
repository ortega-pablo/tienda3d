import type { WebAvailabilityValue, WebSaleStateValue } from '@tienda3d/shared';

/**
 * Si una variante se puede comprar y cuántas por pedido (plan F5·5, D9; portado
 * de `variantAvailability` del sitio):
 *
 * - `MADE_TO_ORDER`: siempre se puede, con plazo; el stock no cuenta.
 * - `STOCK_ONLY`: solo lo que hay en stock.
 * - `STOCK_THEN_ORDER`: lo que hay sale ya; sin stock, se fabrica a pedido.
 */

/** Tope por pedido si la variante no tiene uno propio (el mismo del sitio). */
export const DEFAULT_MAX_PER_ORDER = 20;

export type SaleState = WebSaleStateValue;

export interface AvailabilityFields {
  isActive: boolean;
  availability: WebAvailabilityValue;
  stockQuantity: number;
  maxPerOrder: number | null;
}

export function variantAvailability(v: AvailabilityFields): {
  state: SaleState;
  maxQuantity: number;
} {
  const cap = v.maxPerOrder ?? DEFAULT_MAX_PER_ORDER;
  if (!v.isActive) return { state: 'OUT_OF_STOCK', maxQuantity: 0 };
  if (v.availability === 'MADE_TO_ORDER') return { state: 'MADE_TO_ORDER', maxQuantity: cap };

  const stock = Math.max(0, v.stockQuantity);
  if (v.availability === 'STOCK_ONLY') {
    return stock > 0
      ? { state: 'IN_STOCK', maxQuantity: Math.min(stock, cap) }
      : { state: 'OUT_OF_STOCK', maxQuantity: 0 };
  }
  // STOCK_THEN_ORDER: lo que falta se fabrica, así que el tope es el del pedido.
  return { state: stock > 0 ? 'IN_STOCK' : 'MADE_TO_ORDER', maxQuantity: cap };
}
