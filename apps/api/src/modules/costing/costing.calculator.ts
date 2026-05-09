import { Injectable } from '@nestjs/common';
import type {
  CostingInput,
  CostingResult,
  MaterialCostBreakdown,
  PieceCostBreakdown,
} from './costing.types';

/**
 * Pure domain calculator — Logic C v3.
 *
 *   filament_raw       = (grams/1000) × pricePerKg
 *   filament_waste     = filament_raw × waste%/100
 *   filament_total     = filament_raw + filament_waste
 *   filament_with_reab = filament_total × (1 + reab_filament%/100)
 *
 *   material_raw       = quantity × unitPrice
 *   material_waste     = material_raw × waste%/100
 *   material_total     = material_raw + material_waste
 *   material_with_reab = material_total × (1 + reab_material%/100)
 *
 *   machine_cost       = (sum_print_minutes / 60) × machineHourCost
 *                        (kwh_markup ya aplicado adentro de machineHourCost)
 *
 *   labor_raw          = ((assembly + management) / 60) × laborHourCost
 *   labor_eff          = labor_raw × (1 + labor_markup%/100)
 *
 *   marketing          = marketingMonthly / estimatedUnitsMonth
 *
 *   process            = filament_with_reab + machine + labor_eff + marketing
 *   fabricationPrice   = process × (1 + contingency%/100 + reinvestment%/100)
 *
 *   totalCost          = fabricationPrice + Σ material_with_reab
 *
 * El profit del motor de precios aplica markup sólo sobre fabricationPrice.
 * Los otros insumos (con reabastecimiento) se suman post-profit.
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
      const total = rawCost + wasteAmount;
      const replenishmentAmount = total * (piece.filamentReplenishmentPct / 100);
      return {
        pieceId: piece.pieceId,
        pieceName: piece.pieceName,
        grams: piece.grams,
        printMinutes: piece.printMinutes,
        filamentId: piece.filamentId,
        filamentName: piece.filamentName,
        rawCost,
        wasteAmount,
        total,
        replenishmentPct: piece.filamentReplenishmentPct,
        replenishmentAmount,
        totalWithReplenishment: total + replenishmentAmount,
      };
    });
    const filamentRaw = sum(filamentItems.map((i) => i.rawCost));
    const filamentWaste = sum(filamentItems.map((i) => i.wasteAmount));
    const filamentTotal = filamentRaw + filamentWaste;
    const filamentReplenishment = sum(filamentItems.map((i) => i.replenishmentAmount));
    const filamentTotalWithReplenishment = filamentTotal + filamentReplenishment;
    const totalPrintMinutes = sum(input.pieces.map((p) => p.printMinutes));

    // --- Non-printed materials ---
    const materialItems: MaterialCostBreakdown[] = input.materials.map((m) => {
      if (m.unitPrice <= 0) {
        warnings.push(`Insumo "${m.materialName}" no tiene precio vigente.`);
      }
      const rawCost = m.quantity * m.unitPrice;
      const wasteAmount = rawCost * (m.wastePct / 100);
      const total = rawCost + wasteAmount;
      const replenishmentAmount = total * (m.replenishmentPct / 100);
      return {
        materialId: m.materialId,
        materialName: m.materialName,
        unit: m.unit,
        quantity: m.quantity,
        unitPrice: m.unitPrice,
        rawCost,
        wasteAmount,
        total,
        replenishmentPct: m.replenishmentPct,
        replenishmentAmount,
        totalWithReplenishment: total + replenishmentAmount,
      };
    });
    const materialsRaw = sum(materialItems.map((i) => i.rawCost));
    const materialsWaste = sum(materialItems.map((i) => i.wasteAmount));
    const materialsTotal = materialsRaw + materialsWaste;
    const materialsReplenishment = sum(materialItems.map((i) => i.replenishmentAmount));
    const materialsTotalWithReplenishment = materialsTotal + materialsReplenishment;

    // --- Machine & labor ---
    if (input.machineHourCost <= 0 && totalPrintMinutes > 0) {
      warnings.push('No hay máquina activa configurada — la hora-máquina es 0.');
    }
    const machineTotal = (totalPrintMinutes / 60) * input.machineHourCost;

    const laborMinutes = input.assemblyMinutes + input.managementMinutes;
    const laborRaw = (laborMinutes / 60) * input.laborHourCost;
    const laborMarkupAmount = laborRaw * (input.laborMarkupPct / 100);
    const laborTotal = laborRaw + laborMarkupAmount;
    const laborPerHourEff = input.laborHourCost * (1 + input.laborMarkupPct / 100);

    // --- Marketing prorrateado por producto ---
    const marketingPerUnit =
      input.estimatedUnitsMonth > 0
        ? input.marketingMonthly / input.estimatedUnitsMonth
        : 0;
    if (input.estimatedUnitsMonth <= 0 && input.marketingMonthly > 0) {
      warnings.push('Las unidades estimadas/mes son 0 — el marketing no se prorratea.');
    }

    const process =
      filamentTotalWithReplenishment + machineTotal + laborTotal + marketingPerUnit;
    const contingency = process * (input.contingencyPct / 100);
    const reinvestment = process * (input.reinvestmentPct / 100);
    const fabricationPrice = process + contingency + reinvestment;
    const totalCost = fabricationPrice + materialsTotalWithReplenishment;

    return {
      productId: input.productId,
      productName: input.productName,
      filament: {
        items: filamentItems,
        raw: filamentRaw,
        waste: filamentWaste,
        total: filamentTotal,
        replenishment: filamentReplenishment,
        totalWithReplenishment: filamentTotalWithReplenishment,
        totalMinutes: totalPrintMinutes,
      },
      materials: {
        items: materialItems,
        raw: materialsRaw,
        waste: materialsWaste,
        total: materialsTotal,
        replenishment: materialsReplenishment,
        totalWithReplenishment: materialsTotalWithReplenishment,
      },
      machine: {
        minutes: totalPrintMinutes,
        perHour: input.machineHourCost,
        total: machineTotal,
      },
      labor: {
        minutes: laborMinutes,
        perHourRaw: input.laborHourCost,
        markupPct: input.laborMarkupPct,
        perHour: laborPerHourEff,
        markupAmount: laborMarkupAmount,
        total: laborTotal,
      },
      marketing: {
        monthly: input.marketingMonthly,
        units: input.estimatedUnitsMonth,
        perUnit: marketingPerUnit,
      },
      process,
      contingency,
      reinvestment,
      contingencyPct: input.contingencyPct,
      reinvestmentPct: input.reinvestmentPct,
      fabricationPrice,
      totalCost,
      productionCost: process,
      costWithProvisions: totalCost,
      warnings,
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
