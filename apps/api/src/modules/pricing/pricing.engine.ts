import { Injectable } from '@nestjs/common';
import type {
  ChannelPricingConfig,
  CustomerPricingProfile,
  PriceLine,
  PricingCostInputs,
  PricingGlobals,
  ProductPricingInputs,
  TierOverrides,
} from './pricing.types';

/**
 * Pricing engine — Logic C v3 (markup over fabrication, replenishment per insumo).
 *
 *   profit         = fabricationPrice × markup%
 *   pre_commission = fabricationPrice + profit + otherMaterialsWithReplenishment
 *   denominator    = 1 − commission% − regime%
 *   final_price    = pre_commission / denominator
 *
 * El profit (ganancia de bolsillo) NO depende del valor de los otros insumos:
 * cada uno ya recompone su stock vía replenishmentMarkupPct.
 */

interface TaxComputed {
  /** Sum of regime + retentions (the deduction baked into the denominator). */
  burdenPct: number;
  /** Multiplier applied to the net price for the final buyer-facing price (e.g. IVA). */
  finalMultiplier: number;
}

@Injectable()
export class PricingEngine {
  price(
    cost: PricingCostInputs,
    channel: ChannelPricingConfig,
    product: ProductPricingInputs,
    globals: PricingGlobals,
    tier: TierOverrides = {},
    customer: CustomerPricingProfile = {},
  ): PriceLine {
    const warnings: string[] = [];

    // Resolve commission según el canal, con override del cliente al final.
    const commissionResult = this.resolveCommission(channel, product, tier, globals, customer);
    if (commissionResult.missing) {
      warnings.push(
        `${channel.name} requiere cargar la comisión por producto (canal MARKETPLACE).`,
      );
      return zeroLine({
        markupPct: this.resolveMarkup(product, tier, customer),
        commissionPct: 0,
        taxBurdenPct: 0,
        missingCommission: true,
        warnings,
      });
    }

    const markupPct = this.resolveMarkup(product, tier, customer);
    const profit = cost.fabricationPrice * (markupPct / 100);
    const preCommission =
      cost.fabricationPrice + profit + cost.otherMaterialsWithReplenishment;

    const tax = this.computeTaxes(channel, globals, customer);
    const commissionFraction = commissionResult.value / 100;
    const denominator = 1 - commissionFraction - tax.burdenPct / 100;

    if (denominator <= 0) {
      warnings.push(
        `Denominador no positivo en ${channel.name}: comisión + impuestos ≥ 100%.`,
      );
      return zeroLine({
        markupPct,
        commissionPct: commissionResult.value,
        taxBurdenPct: tax.burdenPct,
        missingCommission: false,
        warnings,
      });
    }

    const netPrice = preCommission / denominator;
    const finalPrice = netPrice * tax.finalMultiplier;
    const effectiveMarginPct = netPrice > 0 ? (profit / netPrice) * 100 : 0;

    return {
      markupPct,
      commissionPct: commissionResult.value,
      taxBurdenPct: tax.burdenPct,
      denominator,
      netPrice,
      finalPrice,
      profit,
      effectiveMarginPct,
      missingCommission: false,
      warnings,
    };
  }

  /**
   * Precedencia (de mayor a menor):
   *   customer.customMarkupPct > tier.markupPct > product.targetMarkupPct
   * El piso de tier (customer.minTierQty) no afecta acá: el caller resuelve
   * la tier que aplica usando el piso antes de pasarla al motor.
   */
  private resolveMarkup(
    product: ProductPricingInputs,
    tier: TierOverrides,
    customer: CustomerPricingProfile,
  ): number {
    if (customer.customMarkupPct != null) return customer.customMarkupPct;
    if (tier.markupPct != null) return tier.markupPct;
    return product.targetMarkupPct;
  }

  private resolveCommission(
    channel: ChannelPricingConfig,
    product: ProductPricingInputs,
    tier: TierOverrides,
    globals: PricingGlobals,
    customer: CustomerPricingProfile,
  ): { value: number; missing: boolean } {
    // El flag del cliente pisa todo y NUNCA marca missing — un cliente
    // exento de comisión no necesita la comisión MELI.
    if (customer.skipChannelCommission) {
      return { value: 0, missing: false };
    }
    // Tier override beats everything for CUSTOM/MARKETPLACE channels.
    if (
      tier.commissionPct != null &&
      (channel.kind === 'CUSTOM' || channel.kind === 'MARKETPLACE')
    ) {
      return { value: tier.commissionPct, missing: false };
    }
    switch (channel.kind) {
      case 'DIRECT_SALE':
        return { value: globals.directSaleCommissionPct, missing: false };
      case 'CASH':
        return { value: 0, missing: false };
      case 'MARKETPLACE': {
        const fromProduct = product.marketplaceCommissionPct;
        if (fromProduct == null) return { value: 0, missing: true };
        return { value: fromProduct, missing: false };
      }
      case 'CUSTOM':
      default:
        return { value: channel.commissionPct, missing: false };
    }
  }

  private computeTaxes(
    channel: ChannelPricingConfig,
    globals: PricingGlobals,
    customer: CustomerPricingProfile,
  ): TaxComputed {
    // Generaliza la regla de CASH: si el cliente está exento, régimen = 0
    // sin importar el canal. Útil para mayoristas/consignación con régimen
    // distinto al unificado.
    if (customer.skipRegime) {
      const finalMultiplier =
        channel.taxMode === 'DETAILED' && channel.appliesIva ? 1.21 : 1;
      return { burdenPct: 0, finalMultiplier };
    }

    if (channel.taxMode === 'DETAILED') {
      const iibb = channel.iibbPct ?? 0;
      const retentions =
        (channel.retentionIvaPct ?? 0) +
        (channel.retentionIibbPct ?? 0) +
        (channel.retentionIncomePct ?? 0);
      return {
        burdenPct: iibb + retentions,
        finalMultiplier: channel.appliesIva ? 1.21 : 1,
      };
    }
    // SIMPLE: régimen unificado aplica a todo canal SIMPLE excepto CASH.
    // CASH (Contado S/F) opera sin factura, así que el régimen no corresponde.
    const regime = channel.kind === 'CASH' ? 0 : globals.unifiedRegimePct;
    return { burdenPct: regime, finalMultiplier: 1 };
  }
}

function zeroLine(partial: {
  markupPct: number;
  commissionPct: number;
  taxBurdenPct: number;
  missingCommission: boolean;
  warnings: string[];
}): PriceLine {
  return {
    ...partial,
    denominator: 0,
    netPrice: 0,
    finalPrice: 0,
    profit: 0,
    effectiveMarginPct: 0,
  };
}
