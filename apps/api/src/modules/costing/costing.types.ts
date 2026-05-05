/**
 * Inputs and outputs for the cost calculator. Kept framework-free so the
 * calculator can be unit-tested in isolation.
 */

export interface PieceCostInput {
  pieceId: string;
  pieceName: string;
  grams: number;
  printMinutes: number;
  filamentId: string;
  filamentName: string;
  /** Price per kilogram in ARS (assumes filaments are stored in KG). */
  filamentPricePerKg: number;
  /** Waste percentage (e.g. 5 means 5%). */
  filamentWastePct: number;
}

export interface MaterialCostInput {
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  wastePct: number;
}

export interface CostingInput {
  productId: string;
  productName: string;
  pieces: PieceCostInput[];
  materials: MaterialCostInput[];
  assemblyMinutes: number;
  managementMinutes: number;
  marketingMonthly: number;
  estimatedUnitsMonth: number;
  // Globals
  machineHourCost: number;
  laborHourCost: number;
  contingencyPct: number;
  reinvestmentPct: number;
}

export interface PieceCostBreakdown {
  pieceId: string;
  pieceName: string;
  grams: number;
  printMinutes: number;
  filamentId: string;
  filamentName: string;
  rawCost: number;
  wasteAmount: number;
  total: number;
}

export interface MaterialCostBreakdown {
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  rawCost: number;
  wasteAmount: number;
  total: number;
}

export interface CostingResult {
  productId: string;
  productName: string;

  filament: {
    items: PieceCostBreakdown[];
    raw: number;
    waste: number;
    total: number;
    totalMinutes: number;
  };
  materials: {
    items: MaterialCostBreakdown[];
    raw: number;
    waste: number;
    total: number;
  };
  machine: {
    minutes: number;
    perHour: number;
    total: number;
  };
  labor: {
    minutes: number;
    perHour: number;
    total: number;
  };
  marketing: {
    monthly: number;
    units: number;
    perUnit: number;
  };

  /** Sum of all components (mirrors Excel E38). */
  productionCost: number;
  contingency: number;
  reinvestment: number;
  /** productionCost + contingency + reinvestment (mirrors Excel E41). */
  costWithProvisions: number;

  warnings: string[];
}
