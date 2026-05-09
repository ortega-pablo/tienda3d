/**
 * PricingEngine — Logic C v3.
 *
 *   profit         = fabricationPrice × markup%
 *   pre_commission = fabricationPrice + profit + otherMaterialsWithReplenishment
 *   denominator    = 1 − commission% − regime%
 *   final_price    = pre_commission / denominator
 *
 * Cuaderno A5 (con todos los markups en cero) tenía un costWithProvisions de
 * $16.611,66 bajo Logic B. Bajo Logic C v3 separamos:
 *   fabricationPrice = filamento+máquina+obra+marketing × 1.15  ≈ 13.554,72
 *   otherWithReab    = hojas (con waste 0)                       =  2.855,04
 *   totalCost        = 16.409,76    (≈, ligeramente menor porque las hojas
 *                                    no entran a las provisiones)
 *
 * Para los tests reusamos números redondos para que el lector pueda chequear
 * a mano el cálculo.
 */

import { PricingEngine } from './pricing.engine';
import type {
  ChannelPricingConfig,
  PricingCostInputs,
  PricingGlobals,
  ProductPricingInputs,
} from './pricing.types';

describe('PricingEngine — Logic C v3', () => {
  const engine = new PricingEngine();
  const cost: PricingCostInputs = {
    fabricationPrice: 10_000,
    otherMaterialsWithReplenishment: 2_000,
  };
  const globals: PricingGlobals = { directSaleCommissionPct: 6.5, unifiedRegimePct: 4 };
  const product: ProductPricingInputs = { targetMarkupPct: 60 };

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

  describe('Profit (ganancia de bolsillo) is fixed across channels', () => {
    const channels = {
      directa: make({ name: 'Venta Directa', slug: 'directa', kind: 'DIRECT_SALE' }),
      meli: make({ name: 'MercadoLibre', slug: 'meli', kind: 'MARKETPLACE' }),
      cash: make({ name: 'Efectivo', slug: 'efectivo', kind: 'CASH' }),
    };

    // Profit = fabricationPrice × 60% = 6.000 (independiente del canal y de los otros insumos)
    const expectedProfit = 6_000;
    // pre_commission = 10.000 + 6.000 + 2.000 = 18.000
    const preCommission = 18_000;

    it('Venta Directa: profit = fabricationPrice × markup', () => {
      const r = engine.price(cost, channels.directa, product, globals);
      expect(r.profit).toBeCloseTo(expectedProfit, 4);
      // Net = 18.000 / (1 − 0.065 − 0.04) = 18.000 / 0.895 = 20.111,73
      expect(r.netPrice).toBeCloseTo(preCommission / 0.895, 1);
    });

    it('MercadoLibre con 13% comisión: mismo profit, precio mayor', () => {
      const r = engine.price(
        cost,
        channels.meli,
        { ...product, marketplaceCommissionPct: 13 },
        globals,
      );
      expect(r.profit).toBeCloseTo(expectedProfit, 4);
      expect(r.netPrice).toBeCloseTo(preCommission / (1 - 0.13 - 0.04), 1);
    });

    it('Efectivo (Contado S/F): exento de régimen — denominador = 1 - comisión', () => {
      // CASH no factura → no aplica régimen unificado, sin importar globals.
      const r = engine.price(cost, channels.cash, product, globals);
      expect(r.profit).toBeCloseTo(expectedProfit, 4);
      expect(r.taxBurdenPct).toBe(0);
      expect(r.denominator).toBeCloseTo(1, 6);
      expect(r.netPrice).toBeCloseTo(preCommission, 1);
    });
  });

  describe('Profit ignora otros insumos (Logic C v3)', () => {
    it('cambiar otherMaterialsWithReplenishment no afecta profit, sólo el precio', () => {
      const c = make({ name: 'Directa', slug: 'directa', kind: 'DIRECT_SALE' });
      const r1 = engine.price(cost, c, product, globals);
      const r2 = engine.price({ ...cost, otherMaterialsWithReplenishment: 50_000 }, c, product, globals);
      expect(r1.profit).toBeCloseTo(r2.profit, 4);
      expect(r2.netPrice).toBeGreaterThan(r1.netPrice);
    });

    it('profit escala con fabricationPrice, no con costo total', () => {
      const c = make({ name: 'Directa', slug: 'directa', kind: 'DIRECT_SALE' });
      const r = engine.price({ ...cost, fabricationPrice: 20_000 }, c, product, globals);
      expect(r.profit).toBeCloseTo(20_000 * 0.6, 4);
    });
  });

  describe('Commission resolution by kind', () => {
    it('DIRECT_SALE usa globals, ignorando channel.commissionPct', () => {
      const c = make({
        name: 'Directa',
        slug: 'directa',
        kind: 'DIRECT_SALE',
        commissionPct: 99,
      });
      const r = engine.price(cost, c, product, globals);
      expect(r.commissionPct).toBe(6.5);
    });

    it('CASH siempre 0', () => {
      const c = make({ name: 'Efectivo', slug: 'efectivo', kind: 'CASH', commissionPct: 99 });
      const r = engine.price(cost, c, product, globals);
      expect(r.commissionPct).toBe(0);
    });

    it('MARKETPLACE marca missingCommission cuando producto no la tiene', () => {
      const c = make({ name: 'MELI', slug: 'meli', kind: 'MARKETPLACE' });
      const r = engine.price(cost, c, product, globals);
      expect(r.missingCommission).toBe(true);
      expect(r.netPrice).toBe(0);
    });

    it('CUSTOM tier override pisa channel default', () => {
      const c = make({ name: 'Custom', slug: 'cu', kind: 'CUSTOM', commissionPct: 8 });
      const r = engine.price(cost, c, product, globals, { commissionPct: 4 });
      expect(r.commissionPct).toBe(4);
    });
  });

  describe('Tier markup overrides', () => {
    it('tier markup pisa product target markup', () => {
      const c = make({ name: 'Directa', slug: 'directa', kind: 'DIRECT_SALE' });
      const r = engine.price(cost, c, product, globals, { markupPct: 40 });
      expect(r.markupPct).toBe(40);
      expect(r.profit).toBeCloseTo(cost.fabricationPrice * 0.4, 4);
    });

    it('markup menor en mayor cantidad → menor profit absoluto', () => {
      const c = make({ name: 'Directa', slug: 'directa', kind: 'DIRECT_SALE' });
      const baseR = engine.price(cost, c, product, globals);
      const tierR = engine.price(cost, c, product, globals, { markupPct: 40 });
      expect(tierR.profit).toBeLessThan(baseR.profit);
      expect(tierR.netPrice).toBeLessThan(baseR.netPrice);
    });
  });

  describe('Detailed tax mode', () => {
    it('separa IIBB y retenciones para CUSTOM detailed', () => {
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
      expect(r.netPrice).toBeCloseTo(18_000 / 0.805, 1);
      expect(r.taxBurdenPct).toBeCloseTo(6.5, 6);
    });

    it('appliesIva multiplica el precio final', () => {
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
    it('denominator no positivo → warning y ceros', () => {
      const c = make({ name: 'Roto', slug: 'roto', kind: 'CUSTOM', commissionPct: 99 });
      const r = engine.price(cost, c, product, globals);
      expect(r.netPrice).toBe(0);
      expect(r.warnings.length).toBeGreaterThan(0);
    });

    it('effectiveMargin = profit / net price', () => {
      const c = make({ name: 'Directa', slug: 'directa', kind: 'DIRECT_SALE' });
      const r = engine.price(cost, c, product, globals);
      const expected = (6_000 / (18_000 / 0.895)) * 100;
      expect(r.effectiveMarginPct).toBeCloseTo(expected, 1);
    });
  });

  describe('CustomerPricingProfile (Fase 2)', () => {
    const directa = make({ name: 'Venta Directa', slug: 'directa', kind: 'DIRECT_SALE' });

    it('skipChannelCommission fuerza comisión 0 en DIRECT_SALE', () => {
      const r = engine.price(cost, directa, product, globals, {}, { skipChannelCommission: true });
      expect(r.commissionPct).toBe(0);
      // denom = 1 − 0 − 0.04 = 0.96
      expect(r.netPrice).toBeCloseTo(18_000 / 0.96, 1);
      expect(r.profit).toBeCloseTo(6_000, 4);
    });

    it('skipChannelCommission cubre MARKETPLACE sin marcar missingCommission', () => {
      const meli = make({ name: 'MELI', slug: 'meli', kind: 'MARKETPLACE' });
      // Sin skipChannelCommission este caso requeriría marketplaceCommissionPct.
      const r = engine.price(cost, meli, product, globals, {}, { skipChannelCommission: true });
      expect(r.missingCommission).toBe(false);
      expect(r.commissionPct).toBe(0);
      expect(r.netPrice).toBeCloseTo(18_000 / 0.96, 1);
    });

    it('skipRegime fuerza régimen 0 en canal NO-CASH (generaliza la regla)', () => {
      const r = engine.price(cost, directa, product, globals, {}, { skipRegime: true });
      expect(r.taxBurdenPct).toBe(0);
      // denom = 1 − 0.065 − 0 = 0.935
      expect(r.netPrice).toBeCloseTo(18_000 / 0.935, 1);
    });

    it('customMarkupPct pisa al markup del producto y al de la tier', () => {
      const r = engine.price(
        cost,
        directa,
        product,
        globals,
        { markupPct: 30 },
        { customMarkupPct: 40 },
      );
      expect(r.markupPct).toBe(40);
      expect(r.profit).toBeCloseTo(cost.fabricationPrice * 0.4, 4);
    });

    it('customMarkupPct sin tier ni product target sigue mandando', () => {
      const r = engine.price(cost, directa, product, globals, {}, { customMarkupPct: 25 });
      expect(r.markupPct).toBe(25);
    });

    it('combinación CONSIGNACIÓN: skipChannelCommission + skipRegime → sin descuentos', () => {
      const r = engine.price(
        cost,
        directa,
        product,
        globals,
        {},
        { skipChannelCommission: true, skipRegime: true },
      );
      expect(r.commissionPct).toBe(0);
      expect(r.taxBurdenPct).toBe(0);
      expect(r.denominator).toBeCloseTo(1, 6);
      // Sin denominator, el precio iguala al pre_commission.
      expect(r.netPrice).toBeCloseTo(18_000, 1);
      expect(r.profit).toBeCloseTo(6_000, 4);
    });

    it('cliente sin profile (defaults vacíos) replica el cálculo público', () => {
      const sinProfile = engine.price(cost, directa, product, globals);
      const conProfileVacio = engine.price(cost, directa, product, globals, {}, {});
      expect(sinProfileEqual(sinProfile, conProfileVacio)).toBe(true);
    });
  });
});

/** Helper: dos PriceLine son equivalentes en sus campos numéricos clave. */
function sinProfileEqual(a: { profit: number; netPrice: number; finalPrice: number; commissionPct: number; taxBurdenPct: number }, b: typeof a) {
  return (
    Math.abs(a.profit - b.profit) < 0.001 &&
    Math.abs(a.netPrice - b.netPrice) < 0.001 &&
    Math.abs(a.finalPrice - b.finalPrice) < 0.001 &&
    a.commissionPct === b.commissionPct &&
    a.taxBurdenPct === b.taxBurdenPct
  );
}
