import { Injectable } from '@nestjs/common';
import type {
  CostingInput,
  CostingResult,
  MaterialCostBreakdown,
  PieceCostBreakdown,
} from './costing.types';

/**
 * Pure domain calculator. Replicates the Excel cost model:
 *
 *   filament_cost(piece) = (grams / 1000) × filament_price_per_kg
 *   filament_with_waste  = filament_cost × (1 + filament_waste_pct/100)   -- per piece
 *
 *   material_cost = quantity × unit_price
 *   material_with_waste = material_cost × (1 + material_waste_pct/100)
 *
 *   machine_cost  = (sum_print_minutes / 60) × machine_hour_cost
 *   labor_cost    = ((assembly + management) / 60) × labor_hour_cost
 *   marketing     = marketing_monthly / estimated_units_month
 *
 *   production_cost   = filament + materials + machine + labor + marketing
 *   contingency       = production_cost × contingency_pct/100
 *   reinvestment      = production_cost × reinvestment_pct/100
 *   cost_with_provisions = production_cost + contingency + reinvestment
 */
@Injectable()
export class CostingCalculator {
  compute(input: CostingInput): CostingResult {
    const warnings: string[] = [];

    // --- Filament (per printed piece) ---
    const filamentItems: PieceCostBreakdown[] = input.pieces.map((piece) => {
      if (piece.filamentPricePerKg <= 0) {
        warnings.push(`Filamento "${piece.filamentName}" no tiene precio vigente.`);
      }
      const rawCost = (piece.grams / 1000) * piece.filamentPricePerKg;
      const wasteAmount = rawCost * (piece.filamentWastePct / 100);
      return {
        pieceId: piece.pieceId,
        pieceName: piece.pieceName,
        grams: piece.grams,
        printMinutes: piece.printMinutes,
        filamentId: piece.filamentId,
        filamentName: piece.filamentName,
        rawCost,
        wasteAmount,
        total: rawCost + wasteAmount,
      };
    });
    const filamentRaw = sum(filamentItems.map((i) => i.rawCost));
    const filamentWaste = sum(filamentItems.map((i) => i.wasteAmount));
    const filamentTotal = filamentRaw + filamentWaste;
    const totalPrintMinutes = sum(input.pieces.map((p) => p.printMinutes));

    // --- Non-printed materials ---
    const materialItems: MaterialCostBreakdown[] = input.materials.map((m) => {
      if (m.unitPrice <= 0) {
        warnings.push(`Insumo "${m.materialName}" no tiene precio vigente.`);
      }
      const rawCost = m.quantity * m.unitPrice;
      const wasteAmount = rawCost * (m.wastePct / 100);
      return {
        materialId: m.materialId,
        materialName: m.materialName,
        unit: m.unit,
        quantity: m.quantity,
        unitPrice: m.unitPrice,
        rawCost,
        wasteAmount,
        total: rawCost + wasteAmount,
      };
    });
    const materialsRaw = sum(materialItems.map((i) => i.rawCost));
    const materialsWaste = sum(materialItems.map((i) => i.wasteAmount));
    const materialsTotal = materialsRaw + materialsWaste;

    // --- Machine & labor ---
    if (input.machineHourCost <= 0 && totalPrintMinutes > 0) {
      warnings.push('No hay máquina activa configurada — la hora-máquina es 0.');
    }
    const machineTotal = (totalPrintMinutes / 60) * input.machineHourCost;
    const laborMinutes = input.assemblyMinutes + input.managementMinutes;
    const laborTotal = (laborMinutes / 60) * input.laborHourCost;

    // --- Marketing prorrateado por producto ---
    const marketingPerUnit =
      input.estimatedUnitsMonth > 0
        ? input.marketingMonthly / input.estimatedUnitsMonth
        : 0;
    if (input.estimatedUnitsMonth <= 0 && input.marketingMonthly > 0) {
      warnings.push('Las unidades estimadas/mes son 0 — el marketing no se prorratea.');
    }

    const productionCost =
      filamentTotal + materialsTotal + machineTotal + laborTotal + marketingPerUnit;
    const contingency = productionCost * (input.contingencyPct / 100);
    const reinvestment = productionCost * (input.reinvestmentPct / 100);
    const costWithProvisions = productionCost + contingency + reinvestment;

    return {
      productId: input.productId,
      productName: input.productName,
      filament: {
        items: filamentItems,
        raw: filamentRaw,
        waste: filamentWaste,
        total: filamentTotal,
        totalMinutes: totalPrintMinutes,
      },
      materials: {
        items: materialItems,
        raw: materialsRaw,
        waste: materialsWaste,
        total: materialsTotal,
      },
      machine: {
        minutes: totalPrintMinutes,
        perHour: input.machineHourCost,
        total: machineTotal,
      },
      labor: {
        minutes: laborMinutes,
        perHour: input.laborHourCost,
        total: laborTotal,
      },
      marketing: {
        monthly: input.marketingMonthly,
        units: input.estimatedUnitsMonth,
        perUnit: marketingPerUnit,
      },
      productionCost,
      contingency,
      reinvestment,
      costWithProvisions,
      warnings,
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
