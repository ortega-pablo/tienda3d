import { z } from 'zod';

/**
 * Contrato de entrada de las cotizaciones — fuente única para la API y para
 * los formularios de web.
 *
 * Los enums se declaran como literales en vez de `z.nativeEnum(QuoteStatus)`:
 * este paquete lo importa también el bundle del navegador y no puede depender
 * de `@prisma/client`. La API verifica en tiempo de compilación que estos
 * literales coincidan con los enums de Prisma (ver quotes.controller.ts), así
 * que agregar un estado nuevo en el schema rompe el build si no se refleja acá.
 */

export const quoteStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
]);
export type QuoteStatusValue = z.infer<typeof quoteStatusSchema>;

export const quoteTypeSchema = z.enum(['PRODUCT', 'ADHOC']);
export type QuoteTypeValue = z.infer<typeof quoteTypeSchema>;

export const adhocPieceSchema = z.object({
  name: z.string().min(1).max(120),
  grams: z.number().nonnegative(),
  printMinutes: z.number().nonnegative(),
  filamentId: z.string().min(1),
});

export const adhocPayloadSchema = z.object({
  pieces: z.array(adhocPieceSchema),
  /**
   * Solo llaveros: piezas para 1 unidad (base de la escala 1-4). `pieces` es
   * la tanda (placa). Si está ausente, 1-4 cae a `pieces` ÷ batchSize.
   */
  individualPieces: z.array(adhocPieceSchema).optional(),
  materials: z.array(
    z.object({
      materialId: z.string().min(1),
      quantity: z.number().positive(),
    }),
  ),
  assemblyMinutes: z.number().nonnegative(),
  managementMinutes: z.number().nonnegative(),
  designMinutes: z.number().nonnegative().optional(),
  /**
   * Si vale 'KEYCHAIN' el flujo aplica el modelo de llaveros: acepta cualquier
   * cantidad entera ≥ 1 y resuelve el markup desde la escala contigua
   * (`KeychainScaleTier`) que cubre la cantidad. La escala 1-4 usa
   * `individualPieces`; las escalas 5+ usan `pieces` (tanda) ÷ batchSize.
   */
  templateKind: z.literal('KEYCHAIN').optional(),
});

export const productItemSchema = z.object({
  type: z.literal('PRODUCT'),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  description: z.string().max(240).optional(),
});

export const adhocItemSchema = z.object({
  type: z.literal('ADHOC'),
  description: z.string().min(1).max(240),
  quantity: z.number().positive(),
  payload: adhocPayloadSchema,
});

export const quoteItemSchema = z.discriminatedUnion('type', [
  productItemSchema,
  adhocItemSchema,
]);

export const quoteCreateSchema = z.object({
  customerId: z.string().min(1).nullable().optional(),
  customerName: z.string().max(160).optional(),
  customerEmail: z.string().email().nullable().optional(),
  customerPhone: z.string().max(40).nullable().optional(),
  customerNotes: z.string().max(2000).nullable().optional(),
  channelId: z.string().min(1).nullable(),
  withInvoice: z.boolean().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  discount: z.number().min(0).optional(),
  items: z.array(quoteItemSchema).min(1),
});

export const quotePreviewSchema = z.object({
  channelId: z.string().nullable(),
  customerId: z.string().min(1).nullable().optional(),
  item: quoteItemSchema,
});

export const quoteStatusUpdateSchema = z.object({
  status: quoteStatusSchema,
});

export const quoteListQuerySchema = z.object({
  type: quoteTypeSchema.optional(),
  /** Filtra cotizaciones cuyos items tienen `templateKind: 'KEYCHAIN'` en el payload. */
  templateKind: z.literal('KEYCHAIN').optional(),
});

export const adhocCostSchema = z.object({
  channelId: z.string().nullable().optional(),
  payload: adhocPayloadSchema,
});

export const keychainMatrixSchema = z.object({
  channelId: z.string().min(1),
  customerId: z.string().min(1).nullable().optional(),
  /**
   * Payload sin templateKind ni designMinutes/Surcharge: el endpoint los
   * computa para cada tier de la grilla y devuelve filas comparativas.
   */
  payload: adhocPayloadSchema,
});

export type AdhocPiece = z.infer<typeof adhocPieceSchema>;
export type AdhocPayload = z.infer<typeof adhocPayloadSchema>;
export type QuoteItemInputDto = z.infer<typeof quoteItemSchema>;
export type QuoteCreateDto = z.infer<typeof quoteCreateSchema>;
export type QuotePreviewDto = z.infer<typeof quotePreviewSchema>;
export type KeychainMatrixDto = z.infer<typeof keychainMatrixSchema>;
