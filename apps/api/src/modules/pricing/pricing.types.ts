/**
 * Pricing input/output types — kept framework-free so the engine is testable
 * in isolation against fixed values from the Excel.
 *
 * Logic C v3:
 *   profit            = fabricationPrice × markup%
 *                       (NO se aplica sobre los otros insumos: el
 *                        replenishmentMarkupPct ya cubre su reposición).
 *   pre_commission    = fabricationPrice + profit + otherMaterialsWithReplenishment
 *   denominator       = 1 − commission% − regime%
 *   final_price       = pre_commission / denominator
 *
 * Profit es el mismo absoluto entre canales (sólo depende de fabricación);
 * el precio varía porque comisiones/régimen difieren.
 */

export type TaxMode = 'SIMPLE' | 'DETAILED';
export type InvoiceType = 'A' | 'B' | 'C' | 'X';
export type ChannelKind = 'DIRECT_SALE' | 'CASH' | 'MARKETPLACE' | 'CUSTOM';

export interface ChannelPricingConfig {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  kind: ChannelKind;
  taxMode: TaxMode;
  /** Default commission for CUSTOM kind; ignored otherwise. */
  commissionPct: number;
  withInvoiceDefault: boolean;

  // SIMPLE mode
  unifiedRegimePct: number | null;

  // DETAILED mode
  iibbPct: number | null;
  appliesIva: boolean;
  defaultInvoiceType: InvoiceType;
  retentionIvaPct: number | null;
  retentionIibbPct: number | null;
  retentionIncomePct: number | null;
}

export interface PricingGlobals {
  /** Commission for DIRECT_SALE channels (single source of truth). */
  directSaleCommissionPct: number;
  /** Régimen unificado for SIMPLE tax mode — applies to every SIMPLE channel. */
  unifiedRegimePct: number;
}

export interface ProductPricingInputs {
  /** % markup over fabricationPrice — yields the absolute profit per unit. */
  targetMarkupPct: number;
  /** Required only for MARKETPLACE channels (e.g. MELI category fee). */
  marketplaceCommissionPct?: number | null;
}

export interface TierOverrides {
  /** Override the product markup at this scale. */
  markupPct?: number | null;
  /** Override the channel/product commission (only valid on CUSTOM/MARKETPLACE). */
  commissionPct?: number | null;
}

/**
 * Logic C v3 — costing inputs for the engine. Replaces the single `cost`
 * scalar with two components so profit can be computed only on fabrication.
 */
export interface PricingCostInputs {
  /** Precio de fabricación (filamento + máquina + obra + marketing + provisiones). */
  fabricationPrice: number;
  /** Σ otros insumos con reabastecimiento — entran post-profit. */
  otherMaterialsWithReplenishment: number;
}

export interface PriceLine {
  markupPct: number;
  commissionPct: number;
  /** Sum of taxes/regimes deducted in the denominator (varies by mode). */
  taxBurdenPct: number;
  denominator: number;
  /** Final price the customer pays (= net unless DETAILED + appliesIva). */
  finalPrice: number;
  /** Net price (without IVA when DETAILED+appliesIva). */
  netPrice: number;
  /**
   * Ganancia de bolsillo — profit absoluto por unidad. En Logic C v3 se
   * calcula como `fabricationPrice × markup%` y queda fijo entre canales.
   */
  profit: number;
  /** Effective profit margin sobre precio final (informational). */
  effectiveMarginPct: number;
  /** True when the channel/product combo cannot price (e.g. MARKETPLACE w/o commission). */
  missingCommission: boolean;
  warnings: string[];
}
