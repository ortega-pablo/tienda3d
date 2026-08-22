/**
 * Tipos de ENTRADA del servicio de cotizaciones.
 *
 * Se separan de los DTO de respuesta (que viven en `@tienda3d/shared`) porque
 * son el contrato interno entre el controller y el service: el contrato con el
 * cliente lo define el schema de Zod compartido.
 */
import type { AdhocItemPayload } from '@tienda3d/shared';

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
