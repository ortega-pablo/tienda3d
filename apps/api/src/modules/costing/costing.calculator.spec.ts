/**
 * Logic C v3 — replenishment per material + labor & energy markups.
 *
 * Base case mantiene los inputs del Cuaderno A5 con todos los markups en cero,
 * por lo que el `process` (sin reabastecimiento) iguala la `productionCost`
 * histórica del Excel:
 *
 *   PLA $/kg              28234
 *   Hojas $/resma 500     17844
 *   Tapa delantera         60 g · 150 min
 *   Tapa trasera           60 g · 150 min
 *   Discos (8 unid.)       15 g ·  75 min
 *   Hojas / cuaderno       80 unid
 *   Marketing/mes         15000 / 20 = 750
 *   Hora máquina         (1.4M-350k)/6000 + (260/1000)*303.98 + 80000/2000
 *                         = 175 + 79.0348 + 40 = 294.0348 → ×6.25 = 1837.72
 *   Mano de obra/h         5000
 *   Desperdicio %          5
 *   Contingencia %         5
 *   Reinversión %         10
 *
 * Caso C v3 con todos los markups encendidos:
 *   replenishmentPct (filamento + hojas)  15
 *   laborMarkupPct                         5  (kwhMarkup ya viene plegado en machineHourCost)
 *   markup target del producto            60
 *
 * Aclaración: el calculador no aplica el markup de ganancia (lo hace el
 * pricing engine). Aquí sólo verificamos los componentes del costo.
 */

import { CostingCalculator } from './costing.calculator';
import type { CostingInput } from './costing.types';

describe('CostingCalculator — Logic C v3', () => {
  const calc = new CostingCalculator();

  const machineHourCost =
    (1_400_000 - 350_000) / 6_000 + (260 / 1000) * 303.98 + 80_000 / 2_000;

  const baseInput: CostingInput = {
    productId: 'a5',
    productName: 'Cuaderno A5 — 8 discos',
    pieces: [
      {
        pieceId: 'p1',
        pieceName: 'Tapa delantera',
        grams: 60,
        printMinutes: 150,
        filamentId: 'pla',
        filamentName: 'PLA',
        filamentPricePerKg: 28_234,
        filamentWastePct: 5,
        filamentReplenishmentPct: 0,
      },
      {
        pieceId: 'p2',
        pieceName: 'Tapa trasera',
        grams: 60,
        printMinutes: 150,
        filamentId: 'pla',
        filamentName: 'PLA',
        filamentPricePerKg: 28_234,
        filamentWastePct: 5,
        filamentReplenishmentPct: 0,
      },
      {
        pieceId: 'p3',
        pieceName: 'Discos (8 unid.)',
        grams: 15,
        printMinutes: 75,
        filamentId: 'pla',
        filamentName: 'PLA',
        filamentPricePerKg: 28_234,
        filamentWastePct: 5,
        filamentReplenishmentPct: 0,
      },
    ],
    materials: [
      {
        materialId: 'sheets',
        materialName: 'Hojas A5',
        unit: 'UNIT',
        quantity: 80,
        unitPrice: 17_844 / 500,
        wastePct: 0,
        replenishmentPct: 0,
      },
    ],
    assemblyMinutes: 45,
    managementMinutes: 15,
    marketingMonthly: 15_000,
    estimatedUnitsMonth: 20,
    machineHourCost,
    laborHourCost: 5_000,
    contingencyPct: 5,
    reinvestmentPct: 10,
    laborMarkupPct: 0,
  };

  describe('Backwards-compatible base (todos los markups = 0)', () => {
    const result = calc.compute(baseInput);

    it('matches filament raw (E10)', () => {
      expect(result.filament.raw).toBeCloseTo(3811.59, 1);
    });

    it('matches filament with waste (E12)', () => {
      expect(result.filament.total).toBeCloseTo(4002.17, 1);
    });

    it('filament replenishment is 0 when reab pct is 0', () => {
      expect(result.filament.replenishment).toBeCloseTo(0, 4);
      expect(result.filament.totalWithReplenishment).toBeCloseTo(result.filament.total, 4);
    });

    it('matches sheets cost (E15)', () => {
      expect(result.materials.total).toBeCloseTo(2855.04, 2);
    });

    it('matches machine cost (E21)', () => {
      expect(result.machine.total).toBeCloseTo(1837.72, 1);
    });

    it('matches labor cost (E26)', () => {
      expect(result.labor.total).toBeCloseTo(5000, 2);
    });

    it('matches marketing prorate (E29)', () => {
      expect(result.marketing.perUnit).toBeCloseTo(750, 2);
    });

    it('process equals legacy productionCost when materials reab=0', () => {
      // process = filament_with_reab + machine + labor + marketing
      //         = filament + machine + labor + marketing
      // pero materiales no entran al proceso en C v3 — entran post-profit.
      // Comparamos contra el productionCost histórico SIN hojas:
      const expectedProcess = 4002.17 + 1837.72 + 5000 + 750;
      expect(result.process).toBeCloseTo(expectedProcess, 1);
    });

    it('totalCost incluye filamento+máquina+obra+marketing+provisiones+otros', () => {
      const expectedTotal = result.fabricationPrice + result.materials.totalWithReplenishment;
      expect(result.totalCost).toBeCloseTo(expectedTotal, 4);
    });

    it('legacy alias costWithProvisions == totalCost', () => {
      expect(result.costWithProvisions).toBeCloseTo(result.totalCost, 4);
    });
  });

  describe('Logic C v3 con markups encendidos (15% reab, 5% labor)', () => {
    const result = calc.compute({
      ...baseInput,
      pieces: baseInput.pieces.map((p) => ({ ...p, filamentReplenishmentPct: 15 })),
      materials: baseInput.materials.map((m) => ({ ...m, replenishmentPct: 15 })),
      laborMarkupPct: 5,
    });

    it('filament replenishment = filament_total × 15%', () => {
      expect(result.filament.replenishment).toBeCloseTo(result.filament.total * 0.15, 2);
    });

    it('filament with reab = total × 1.15', () => {
      expect(result.filament.totalWithReplenishment).toBeCloseTo(
        result.filament.total * 1.15,
        2,
      );
    });

    it('materials replenishment aplica al insumo no-filamento', () => {
      expect(result.materials.replenishment).toBeCloseTo(result.materials.total * 0.15, 2);
    });

    it('labor markup = laborRaw × 5%', () => {
      const laborRaw = (60 / 60) * 5000; // 60 min total
      expect(result.labor.markupAmount).toBeCloseTo(laborRaw * 0.05, 2);
      expect(result.labor.total).toBeCloseTo(laborRaw * 1.05, 2);
    });

    it('process incluye filamento_con_reab pero NO los otros insumos', () => {
      const expectedProcess =
        result.filament.totalWithReplenishment +
        result.machine.total +
        result.labor.total +
        result.marketing.perUnit;
      expect(result.process).toBeCloseTo(expectedProcess, 2);
    });

    it('fabricationPrice = process × (1 + cont% + reinv%)', () => {
      expect(result.fabricationPrice).toBeCloseTo(result.process * 1.15, 2);
    });

    it('totalCost = fabricationPrice + otros con reab', () => {
      expect(result.totalCost).toBeCloseTo(
        result.fabricationPrice + result.materials.totalWithReplenishment,
        2,
      );
    });

    it('los otros insumos NO se incluyen en fabricationPrice', () => {
      // Con markups encendidos, fabricationPrice NO contiene materials.totalWithReplenishment.
      const fabWithoutOthers = result.fabricationPrice;
      expect(fabWithoutOthers).toBeLessThan(result.totalCost);
    });

    it('emits no warnings when fully configured', () => {
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('warns when filament has no current price', () => {
      const noPrice = calc.compute({
        ...baseInput,
        pieces: [{ ...baseInput.pieces[0]!, filamentPricePerKg: 0 }],
        materials: [],
      });
      expect(noPrice.warnings.some((w) => w.includes('precio vigente'))).toBe(true);
    });

    it('warns when there is no active machine but pieces have print time', () => {
      const noMachine = calc.compute({ ...baseInput, machineHourCost: 0 });
      expect(noMachine.warnings.some((w) => w.includes('máquina activa'))).toBe(true);
    });

    it('marketing prorate is 0 when units = 0 and warns', () => {
      const r = calc.compute({ ...baseInput, estimatedUnitsMonth: 0 });
      expect(r.marketing.perUnit).toBe(0);
      expect(r.warnings.some((w) => w.includes('marketing'))).toBe(true);
    });
  });
});
