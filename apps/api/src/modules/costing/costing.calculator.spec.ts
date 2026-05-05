/**
 * Validation tests against cotizador_cuaderno_plastik_v2.xlsx,
 * sheet "📓 Base A5 (8 discos)".
 *
 * Inputs (from sheets "Parámetros" and "Base A5"):
 *   PLA $/kg              28234
 *   Hojas $/resma 500     17844
 *   Tapa delantera         60 g · 150 min
 *   Tapa trasera           60 g · 150 min
 *   Discos (8 unid.)       15 g ·  75 min  (already aggregated in Excel)
 *   Hojas / cuaderno       80 unid
 *   Packaging              0
 *   Tiempo armado         45 min
 *   Tiempo gestión        15 min
 *   Marketing/mes         15000 / 20 = 750
 *   Hora máquina         (1.4M-350k)/6000 + (260/1000)*303.98 + 80000/2000
 *                         = 175 + 79.0348 + 40 = 294.0348
 *   Mano de obra/h         5000
 *   Desperdicio %          5
 *   Contingencia %         5
 *   Reinversión %         10
 *
 * Expected (from the Excel cells, rounded to 2 decimals):
 *   E10 (filamento s/desperdicio)     3811.59
 *   E12 (filamento c/desperdicio)     4002.17
 *   E15 (hojas)                       2855.04
 *   E21 (hora máquina)                1837.72
 *   E26 (mano de obra)                5000.00
 *   E29 (marketing)                    750.00
 *   E38 (costo de producción)        14444.93
 *   E41 (con provisiones, ×1.15)     16611.66
 */

import { CostingCalculator } from './costing.calculator';
import type { CostingInput } from './costing.types';

describe('CostingCalculator — Excel A5 validation', () => {
  const calc = new CostingCalculator();

  const machineHourCost =
    (1_400_000 - 350_000) / 6_000 + (260 / 1000) * 303.98 + 80_000 / 2_000;

  const a5Input: CostingInput = {
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
      },
    ],
    materials: [
      {
        materialId: 'sheets',
        materialName: 'Hojas A5',
        unit: 'UNIT',
        quantity: 80,
        // Resma 500 hojas a $17844 → $/hoja = 17844/500 = 35.688
        unitPrice: 17_844 / 500,
        wastePct: 0,
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
  };

  const result = calc.compute(a5Input);

  const eps = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

  it('matches filament subtotal without waste (E10)', () => {
    expect(result.filament.raw).toBeCloseTo(3811.59, 1);
  });

  it('matches filament with waste (E12)', () => {
    expect(result.filament.total).toBeCloseTo(4002.17, 1);
  });

  it('matches sheets cost (E15)', () => {
    expect(result.materials.total).toBeCloseTo(2855.04, 2);
  });

  it('matches machine hour cost (E21)', () => {
    expect(result.machine.total).toBeCloseTo(1837.72, 1);
  });

  it('matches labor cost (E26)', () => {
    expect(result.labor.total).toBeCloseTo(5000, 2);
  });

  it('matches marketing prorate (E29)', () => {
    expect(result.marketing.perUnit).toBeCloseTo(750, 2);
  });

  it('matches production cost total (E38)', () => {
    expect(result.productionCost).toBeCloseTo(14_444.93, 1);
  });

  it('matches cost with provisions (E41)', () => {
    expect(result.costWithProvisions).toBeCloseTo(16_611.66, 1);
  });

  it('total print minutes is 375', () => {
    expect(result.filament.totalMinutes).toBe(375);
  });

  it('contingency = production_cost × 5%', () => {
    expect(eps(result.contingency, result.productionCost * 0.05)).toBe(true);
  });

  it('reinvestment = production_cost × 10%', () => {
    expect(eps(result.reinvestment, result.productionCost * 0.1)).toBe(true);
  });

  it('emits no warnings when all prices and machine are configured', () => {
    expect(result.warnings).toEqual([]);
  });

  it('warns when filament has no current price', () => {
    const noPrice = calc.compute({
      ...a5Input,
      pieces: [{ ...a5Input.pieces[0]!, filamentPricePerKg: 0 }],
      materials: [],
    });
    expect(noPrice.warnings.some((w) => w.includes('precio vigente'))).toBe(true);
  });

  it('warns when there is no active machine but pieces have print time', () => {
    const noMachine = calc.compute({ ...a5Input, machineHourCost: 0 });
    expect(noMachine.warnings.some((w) => w.includes('máquina activa'))).toBe(true);
  });
});
