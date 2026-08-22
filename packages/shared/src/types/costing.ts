/**
 * Inputs and outputs for the cost calculator. Kept framework-free so the
 * calculator can be unit-tested in isolation.
 *
 * Logic C v3:
 *   filament_with_reab     = filament_raw     × (1 + reab_filament%)
 *   other_with_reab        = other_raw        × (1 + reab_i%)
 *   labor_eff              = labor_hour_cost  × (1 + labor_markup%)  × hours
 *   process                = filament_with_reab + machine + labor_eff + marketing
 *   process_with_provisions= process × (1 + contingency% + reinvestment%)
 *   fabrication_price      = process_with_provisions
 *
 * The pricing engine then applies markup% to fabrication_price (NOT to total
 * cost), and adds other_with_reab back after profit.
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
  /** Logic C v3 — replenishment markup over the filament raw cost. */
  filamentReplenishmentPct: number;
}

export interface MaterialCostInput {
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  wastePct: number;
  /** Logic C v3 — replenishment markup over the raw cost of this insumo. */
  replenishmentPct: number;
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
  /** Logic C v3 — extra markup over labor hour cost (default 5 %). */
  laborMarkupPct: number;
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
  /** raw + waste — costo del filamento sin reabastecimiento. */
  total: number;
  replenishmentPct: number;
  /** Markup amount = total × replenishmentPct/100. */
  replenishmentAmount: number;
  /** total + replenishmentAmount — el valor que entra al costo de fabricación. */
  totalWithReplenishment: number;
}

export interface MaterialCostBreakdown {
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  rawCost: number;
  wasteAmount: number;
  /** raw + waste — costo del insumo sin reabastecimiento. */
  total: number;
  replenishmentPct: number;
  /** Markup amount = total × replenishmentPct/100. */
  replenishmentAmount: number;
  /** total + replenishmentAmount — el valor que se suma post-profit. */
  totalWithReplenishment: number;
}

export interface CostingResult {
  productId: string;
  productName: string;

  filament: {
    items: PieceCostBreakdown[];
    raw: number;
    waste: number;
    /** raw + waste, sin reabastecimiento. */
    total: number;
    /** Σ replenishmentAmount of pieces. */
    replenishment: number;
    /** total + replenishment — entra al precio de fabricación. */
    totalWithReplenishment: number;
    totalMinutes: number;
  };
  materials: {
    items: MaterialCostBreakdown[];
    raw: number;
    waste: number;
    /** raw + waste, sin reabastecimiento. */
    total: number;
    /** Σ replenishmentAmount of materials. */
    replenishment: number;
    /** total + replenishment — se suma post-profit, NO entra al fabrication price. */
    totalWithReplenishment: number;
  };
  machine: {
    minutes: number;
    perHour: number;
    total: number;
  };
  labor: {
    minutes: number;
    /** Costo crudo por hora (sin markup). */
    perHourRaw: number;
    /** Markup % aplicado sobre la mano de obra. */
    markupPct: number;
    /** Costo efectivo por hora (con markup). */
    perHour: number;
    /** Markup absoluto en pesos por unidad de producto. */
    markupAmount: number;
    /** Total con markup — el que entra al precio de fabricación. */
    total: number;
  };
  marketing: {
    monthly: number;
    units: number;
    perUnit: number;
  };

  /**
   * Logic C v3 — precio de fabricación.
   *   process = filament_with_reab + machine + labor_eff + marketing
   *   fabricationPrice = process × (1 + contingency% + reinvestment%)
   *
   * Es la base sobre la que el motor de precios aplica el markup de ganancia.
   */
  fabricationPrice: number;

  process: number;
  contingency: number;
  reinvestment: number;
  /** % de contingencia y reinversión usados, expuestos para recálculos
   *  customer-aware (ej. cliente con `skipReinvestment`). */
  contingencyPct: number;
  reinvestmentPct: number;

  /**
   * Costo total del producto incluyendo otros insumos con reabastecimiento.
   * NO se usa para calcular profit — sirve para reportes e informes.
   *
   *   totalCost = fabricationPrice + materials.totalWithReplenishment
   */
  totalCost: number;

  /** @deprecated Logic B alias. Equivale a `process` (sin provisiones). */
  productionCost: number;
  /** @deprecated Logic B alias. Equivale a `totalCost`. */
  costWithProvisions: number;

  warnings: string[];
}
