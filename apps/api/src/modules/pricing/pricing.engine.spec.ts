/**
 * Validates the PricingEngine under Logic B (markup over cost).
 *
 * profit       = cost × markup%
 * denominator  = 1 − commission% − regime%
 * final_price  = (cost + profit) / denominator
 *
 * The Cuaderno A5 from cotizador_cuaderno_plastik_v2.xlsx has cost
 * (with provisions) of $16.611,66.
 *
 * The legacy Excel used a 35% margin sobre precio. The equivalent markup
 * sobre costo that preserves the Venta Directa price is:
 *   markup = 0.35 / (1 − 0.35 − 0.065 − 0.04) = 0.6422 → 64.22 %
 */

import { PricingEngine } from './pricing.engine';
import type { ChannelPricingConfig, PricingGlobals, ProductPricingInputs } from './pricing.types';

describe('PricingEngine — Logic B (markup over cost)', () => {
  const engine = new PricingEngine();
  const cost = 16_611.66;
  const globals: PricingGlobals = { directSaleCommissionPct: 6.5, unifiedRegimePct: 4 };
  const product: ProductPricingInputs = { targetMarkupPct: 64.22 };

  const make = (
    overrides: Partial<ChannelPricingConfig> & {
      name: string;
      slug: string;
      kind: ChannelPricingConfig['kind'];
    },
  ): ChannelPricingConfig => ({
    icon: null,
    taxMode: 'SIMPLE',
    commissionPct: 0,
    withInvoiceDefault: false,
    unifiedRegimePct: 4,
    iibbPct: null,
    appliesIva: false,
    defaultInvoiceType: 'X',
    retentionIvaPct: null,
    retentionIibbPct: null,
    retentionIncomePct: null,
    ...overrides,
    id: overrides.slug,
  });

  describe('Profit is fixed across channels', () => {
    const channels = {
      directa: make({ name: 'Venta Directa', slug: 'directa', kind: 'DIRECT_SALE' }),
      meli: make({ name: 'MercadoLibre', slug: 'meli', kind: 'MARKETPLACE' }),
      cash: make({ name: 'Efectivo', slug: 'efectivo', kind: 'CASH' }),
    };

    const expectedProfit = cost * (64.22 / 100); // 10,668.0

    it('Venta Directa: profit = cost × markup', () => {
      const r = engine.price(cost, channels.directa, product, globals);
      expect(r.profit).toBeCloseTo(expectedProfit, 1);
      // Net price = (cost + profit) / (1 − 0.065 − 0.04) = 27279.81 / 0.895 = 30480.24
      expect(r.netPrice).toBeCloseTo(30_480.24, 0);
    });

    it('MercadoLibre with 13% commission: same profit, higher price', () => {
      const r = engine.price(
        cost,
        channels.meli,
        { ...product, marketplaceCommissionPct: 13 },
        globals,
      );
      expect(r.profit).toBeCloseTo(expectedProfit, 1);
      // (cost + profit) / (1 − 0.13 − 0.04) = 27279.81 / 0.83 = 32867.24
      expect(r.netPrice).toBeCloseTo(32_867.24, 0);
    });

    it('Efectivo: same profit, regime applied by default', () => {
      const r = engine.price(cost, channels.cash, product, globals);
      expect(r.profit).toBeCloseTo(expectedProfit, 1);
      // (cost + profit) / (1 − 0 − 0.04) = 27279.81 / 0.96 = 28416.47
      expect(r.netPrice).toBeCloseTo(28_416.47, 0);
    });

    it('Efectivo without regime (admin toggle): same profit, lower price', () => {
      const r = engine.price(cost, channels.cash, product, globals, {}, { withoutRegime: true });
      expect(r.profit).toBeCloseTo(expectedProfit, 1);
      // (cost + profit) / 1 = 27279.81
      expect(r.netPrice).toBeCloseTo(27_279.81, 0);
    });

    it('non-CASH channels ignore withoutRegime', () => {
      const r = engine.price(cost, channels.directa, product, globals, {}, { withoutRegime: true });
      // Same as Directa case above: regime still applied.
      expect(r.netPrice).toBeCloseTo(30_480.24, 0);
    });
  });

  describe('Commission resolution by kind', () => {
    it('DIRECT_SALE uses globals.directSaleCommissionPct, ignoring channel.commissionPct', () => {
      const c = make({
        name: 'Directa',
        slug: 'directa',
        kind: 'DIRECT_SALE',
        commissionPct: 99,
      });
      const r = engine.price(cost, c, product, globals);
      expect(r.commissionPct).toBe(6.5);
    });

    it('CASH always 0, regardless of channel.commissionPct', () => {
      const c = make({ name: 'Efectivo', slug: 'efectivo', kind: 'CASH', commissionPct: 99 });
      const r = engine.price(cost, c, product, globals);
      expect(r.commissionPct).toBe(0);
    });

    it('MARKETPLACE flags missingCommission when product has none', () => {
      const c = make({ name: 'MELI', slug: 'meli', kind: 'MARKETPLACE' });
      const r = engine.price(cost, c, product, globals);
      expect(r.missingCommission).toBe(true);
      expect(r.netPrice).toBe(0);
    });

    it('MARKETPLACE uses product.marketplaceCommissionPct', () => {
      const c = make({ name: 'MELI', slug: 'meli', kind: 'MARKETPLACE' });
      const r = engine.price(
        cost,
        c,
        { ...product, marketplaceCommissionPct: 13 },
        globals,
      );
      expect(r.commissionPct).toBe(13);
    });

    it('CUSTOM uses channel.commissionPct as default', () => {
      const c = make({ name: 'Custom', slug: 'cu', kind: 'CUSTOM', commissionPct: 8 });
      const r = engine.price(cost, c, product, globals);
      expect(r.commissionPct).toBe(8);
    });

    it('CUSTOM tier override beats channel default', () => {
      const c = make({ name: 'Custom', slug: 'cu', kind: 'CUSTOM', commissionPct: 8 });
      const r = engine.price(cost, c, product, globals, { commissionPct: 4 });
      expect(r.commissionPct).toBe(4);
    });
  });

  describe('Tier markup overrides', () => {
    it('tier markup overrides product target markup', () => {
      const c = make({ name: 'Directa', slug: 'directa', kind: 'DIRECT_SALE' });
      const r = engine.price(cost, c, product, globals, { markupPct: 40 });
      expect(r.markupPct).toBe(40);
      expect(r.profit).toBeCloseTo(cost * 0.4, 1);
    });

    it('lower markup at higher quantities yields a smaller absolute profit', () => {
      const c = make({ name: 'Directa', slug: 'directa', kind: 'DIRECT_SALE' });
      const baseR = engine.price(cost, c, product, globals);
      const tierR = engine.price(cost, c, product, globals, { markupPct: 40 });
      expect(tierR.profit).toBeLessThan(baseR.profit);
      expect(tierR.netPrice).toBeLessThan(baseR.netPrice);
    });
  });

  describe('Detailed tax mode', () => {
    it('separates IIBB and retentions for CUSTOM detailed', () => {
      const c = make({
        name: 'Custom Detailed',
        slug: 'cd',
        kind: 'CUSTOM',
        taxMode: 'DETAILED',
        commissionPct: 13,
        iibbPct: 3,
        retentionIvaPct: 1,
        retentionIibbPct: 0.5,
        retentionIncomePct: 2,
      });
      const r = engine.price(cost, c, product, globals);
      // burden = 3 + 1 + 0.5 + 2 = 6.5%; commission 13%; denom = 1 - 0.13 - 0.065 = 0.805
      expect(r.denominator).toBeCloseTo(0.805, 6);
      expect(r.netPrice).toBeCloseTo((cost + cost * 0.6422) / 0.805, 0);
      expect(r.taxBurdenPct).toBeCloseTo(6.5, 6);
    });

    it('appliesIva multiplies the final price', () => {
      const c = make({
        name: 'IVA',
        slug: 'iva',
        kind: 'CUSTOM',
        taxMode: 'DETAILED',
        commissionPct: 0,
        iibbPct: 3,
        appliesIva: true,
      });
      const r = engine.price(cost, c, product, globals);
      expect(r.finalPrice).toBeCloseTo(r.netPrice * 1.21, 1);
    });
  });

  describe('Edge cases', () => {
    it('non-positive denominator emits warning and zero values', () => {
      const c = make({
        name: 'Roto',
        slug: 'roto',
        kind: 'CUSTOM',
        commissionPct: 99,
      });
      const r = engine.price(cost, c, product, globals);
      expect(r.netPrice).toBe(0);
      expect(r.warnings.length).toBeGreaterThan(0);
    });

    it('effective margin sobre precio neto matches expected fraction', () => {
      const c = make({ name: 'Directa', slug: 'directa', kind: 'DIRECT_SALE' });
      const r = engine.price(cost, c, product, globals);
      // Net = (cost + cost·markup) / 0.895
      // Effective margin = profit / net = (cost·markup) × 0.895 / (cost · (1 + markup))
      const expected = (0.6422 * 0.895) / 1.6422;
      expect(r.effectiveMarginPct).toBeCloseTo(expected * 100, 0);
    });
  });
});
