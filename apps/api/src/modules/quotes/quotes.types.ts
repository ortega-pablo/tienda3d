import type { QuoteStatus, QuoteType } from '@prisma/client';

export interface QuoteItemDto {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  /** Ganancia de bolsillo por unidad (Logic C v3) — snapshot al crear. */
  unitProfit: number;
  lineTotal: number;
  adhocPayload: AdhocItemPayload | null;
}

export interface QuoteSummaryDto {
  id: string;
  code: string;
  type: QuoteType;
  status: QuoteStatus;
  customerName: string;
  channelName: string | null;
  total: number;
  itemCount: number;
  createdAt: Date;
  /**
   * Si la cotización es ADHOC y alguno de sus items tiene
   * `templateKind: 'KEYCHAIN'` en su payload, lo marcamos acá para el
   * panel y filtros. null para PRODUCT y ADHOC libre.
   */
  templateKind: 'KEYCHAIN' | null;
}

export interface QuoteDto extends QuoteSummaryDto {
  customerEmail: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  /** FK al Customer persistido. null = walk-in (cliente STANDARD ad-hoc). */
  customerId: string | null;
  /** Snapshot del profile aplicado al crear (Fase 4). null si era walk-in. */
  customerProfileSnapshot: Record<string, unknown> | null;
  channelId: string | null;
  withInvoice: boolean;
  subtotal: number;
  discount: number;
  validUntil: Date | null;
  notes: string | null;
  createdById: string;
  items: QuoteItemDto[];
}

export interface AdhocItemPayload {
  pieces: Array<{
    name: string;
    grams: number;
    printMinutes: number;
    filamentId: string;
    filamentName?: string;
  }>;
  /**
   * Solo para llaveros (`templateKind: 'KEYCHAIN'`): piezas para imprimir 1
   * unidad. Es la base de la escala 1-4. `pieces` pasa a ser la TANDA (placa
   * de `batchSize`), base de las escalas 5+ (se divide por batchSize). Si está
   * ausente, la escala 1-4 cae a `pieces` ÷ batchSize (fallback).
   */
  individualPieces?: Array<{
    name: string;
    grams: number;
    printMinutes: number;
    filamentId: string;
    filamentName?: string;
  }>;
  materials: Array<{
    materialId: string;
    quantity: number;
    materialName?: string;
  }>;
  assemblyMinutes: number;
  managementMinutes: number;
  /**
   * Tiempo de diseño 3D en minutos. Genera un cargo plano por línea
   * (`designMinutes/60 × design_hour_cost`), no escala con la cantidad.
   * El cargo paga comisión de canal y régimen igual que el resto del precio.
   */
  designMinutes?: number;
  /**
   * Surcharge final en pesos al cliente por el cargo de diseño, ya con
   * comisión + régimen + IVA aplicados. Snapshot al crear la cotización
   * para que el PDF muestre lo que se firmó aunque el global param cambie.
   */
  designSurcharge?: number;
  /**
   * Marca que esta cotización a medida usa el modelo de llaveros (grilla
   * global contigua `KeychainScaleTier`, escalas 1-4 / 5-24 / 25-49 / 50-99 /
   * 100+). Acepta cualquier cantidad entera ≥ 1. La escala 1-4 se cotiza con
   * `individualPieces`; las escalas 5+ con `pieces` (tanda) ÷ batchSize. Los
   * insumos y adicionales son por unidad (no se dividen). El markup viene de
   * la escala que cubre la cantidad.
   */
  templateKind?: 'KEYCHAIN';
  /**
   * Tamaño de la tanda/placa (snapshot del global param `keychain_batch_size`).
   * Solo las piezas de la TANDA (`pieces`) se dividen por este valor para las
   * escalas 5+. Insumos, armado, gestión y `designMinutes` NO se dividen.
   */
  batchSize?: number;
  /** Base usada para esta cantidad: 'INDIVIDUAL' (1-4) o 'BATCH' (5+). */
  pricingBase?: 'INDIVIDUAL' | 'BATCH';
  /** Snapshot del markup aplicado por la escala (informativo / auditoría). */
  appliedMarkupPct?: number;
  /** Label legible de la escala ("5-24", "100+") para el PDF y el detalle. */
  tierLabel?: string;
}

export interface ProductItemInput {
  type: 'PRODUCT';
  productId: string;
  quantity: number;
  description?: string;
}

export interface AdhocItemInput {
  type: 'ADHOC';
  description: string;
  quantity: number;
  payload: AdhocItemPayload;
}

export type QuoteItemInput = ProductItemInput | AdhocItemInput;

export interface QuoteCreateInput {
  /**
   * FK opcional. Si está, los datos textuales se autocompletan desde el
   * `Customer` y el motor aplica su profile (flags + minTierQty + customMarkup).
   * Si no, la cotización es walk-in: `customerName` y compañía son strings libres.
   */
  customerId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerNotes?: string | null;
  channelId: string | null;
  withInvoice?: boolean;
  validUntil?: string | null;
  notes?: string | null;
  discount?: number;
  items: QuoteItemInput[];
}
