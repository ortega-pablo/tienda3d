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
  materials: Array<{
    materialId: string;
    quantity: number;
    materialName?: string;
  }>;
  assemblyMinutes: number;
  managementMinutes: number;
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
