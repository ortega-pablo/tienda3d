import type { MatrixCombination } from './variant-matrix';

/**
 * Qué hacer con las variantes de una publicación cuando cambian sus miembros u
 * opciones (plan F5·5, portado de `planVariants` del sitio). Nunca se borra una
 * variante: pudo haberse vendido.
 */

export interface ExistingVariant {
  id: string;
  selectionKey: string;
  isActive: boolean;
  pausedByAdmin: boolean;
}

export interface VariantPlan {
  /** Combinaciones nuevas a crear. */
  create: MatrixCombination[];
  /** Siguen en la matriz y ya estaban activas. */
  keep: string[];
  /** Vuelven a la matriz (por ejemplo, se re-agregó un color). */
  reactivate: string[];
  /** Siguen en la matriz pero el admin las sacó de venta a mano. */
  paused: string[];
  /** Ya no están en la matriz. */
  deactivate: string[];
}

export function planVariants(
  wanted: MatrixCombination[],
  existing: ExistingVariant[],
): VariantPlan {
  const byKey = new Map(existing.map((v) => [v.selectionKey, v]));
  const wantedKeys = new Set(wanted.map((c) => c.selectionKey));
  const plan: VariantPlan = { create: [], keep: [], reactivate: [], paused: [], deactivate: [] };

  for (const combo of wanted) {
    const variant = byKey.get(combo.selectionKey);
    if (!variant) plan.create.push(combo);
    else if (variant.isActive) plan.keep.push(variant.id);
    else if (variant.pausedByAdmin) plan.paused.push(variant.id);
    else plan.reactivate.push(variant.id);
  }
  for (const variant of existing) {
    if (!wantedKeys.has(variant.selectionKey) && variant.isActive) {
      plan.deactivate.push(variant.id);
    }
  }
  return plan;
}

/**
 * SKUs nuevos para un miembro: `<SKU del producto>-VNN` (D15), siguiendo el
 * contador de los que ya existen. Un SKU no se reutiliza nunca.
 */
export function nextVariantSkus(productSku: string, taken: string[], count: number): string[] {
  const prefix = `${productSku}-V`;
  const last = taken
    .filter((sku) => sku.startsWith(prefix))
    .map((sku) => Number(sku.slice(prefix.length)))
    .filter((n) => Number.isInteger(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return Array.from(
    { length: count },
    (_, i) => `${prefix}${String(last + i + 1).padStart(2, '0')}`,
  );
}
