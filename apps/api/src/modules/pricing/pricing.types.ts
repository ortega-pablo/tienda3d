/**
 * Pricing input/output types — kept framework-free so the engine is testable
 * in isolation against fixed values from the Excel.
 *
 * Logic B (markup over cost):
 *   profit       = cost × markup%
 *   denominator  = 1 − commission% − regime%
 *   final_price  = (cost + profit) / denominator
 *
 * Profit is the same absolute value across channels; price varies because
 * commissions/regime differ.
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
  /** % markup over cost — yields the absolute profit per unit. */
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

export interface PricingOptions {
  /** When true and channel.kind === 'CASH', recalculate without applying regime. */
  withoutRegime?: boolean;
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
  /** Absolute profit per unit — fixed across channels (Logic B). */
  profit: number;
  /** Effective profit margin sobre precio final (informational). */
  effectiveMarginPct: number;
  /** True when the channel/product combo cannot price (e.g. MARKETPLACE w/o commission). */
  missingCommission: boolean;
  warnings: string[];
}
