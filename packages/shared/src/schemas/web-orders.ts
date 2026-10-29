import { z } from 'zod';

/**
 * Pedidos de la tienda online en el panel (plan F14·5). Dos ejes con dueño
 * (plan §5.6): el pago lo maneja el sitio, salvo la transferencia que confirma
 * el admin; la preparación, el taller. La API verifica en compilación que los
 * literales coincidan con Prisma (web-orders.contract.ts).
 */

export const webOrderPaymentSchema = z.enum([
  'PENDING',
  'AWAITING_TRANSFER',
  'APPROVED',
  'REJECTED',
  'REFUNDED',
]);
export type WebOrderPaymentValue = z.infer<typeof webOrderPaymentSchema>;

export const webOrderFulfillmentSchema = z.enum([
  'RECEIVED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]);
export type WebOrderFulfillmentValue = z.infer<typeof webOrderFulfillmentSchema>;

export const webPaymentMethodSchema = z.enum(['MERCADOPAGO', 'BANK_TRANSFER']);
export type WebPaymentMethodValue = z.infer<typeof webPaymentMethodSchema>;

export const webDeliveryMethodSchema = z.enum(['PICKUP', 'SHIPPING']);
export type WebDeliveryMethodValue = z.infer<typeof webDeliveryMethodSchema>;

/** Día de Argentina, `AAAA-MM-DD`. */
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const webOrderListQuerySchema = z.object({
  fulfillment: webOrderFulfillmentSchema.optional(),
  payment: webOrderPaymentSchema.optional(),
  delivery: webDeliveryMethodSchema.optional(),
  /** Pedidos hechos desde este día (inclusive). */
  from: daySchema.optional(),
  /** Pedidos hechos hasta este día (inclusive). */
  to: daySchema.optional(),
  /** Solo los que esperan algo del taller (el contador del menú). */
  attention: z.literal('1').optional(),
  /** Los pedidos de un cliente del sistema (su ficha, F14·8). */
  customer: z.string().min(1).max(64).optional(),
});
export type WebOrderListQuery = z.infer<typeof webOrderListQuerySchema>;

/** Un paso de la preparación. Cancelar va aparte: pide el motivo. */
export const webOrderFulfillmentChangeSchema = z
  .object({
    status: z.enum(['PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED']),
    /** Código de seguimiento del envío (solo al pasar a enviado). */
    trackingCode: z.string().trim().max(120).optional(),
  })
  .strict();
export type WebOrderFulfillmentChangeInput = z.infer<typeof webOrderFulfillmentChangeSchema>;

export const webOrderCancelSchema = z
  .object({
    reason: z.string().trim().min(3, 'Contá por qué se cancela.').max(500),
  })
  .strict();
export type WebOrderCancelInput = z.infer<typeof webOrderCancelSchema>;

export const webOrderNotesSchema = z
  .object({
    internalNotes: z.string().trim().max(4000),
  })
  .strict();
export type WebOrderNotesInput = z.infer<typeof webOrderNotesSchema>;

/** Orden de producción de un ítem (F14·7): cuántas unidades fabricar. */
export const webOrderProductionSchema = z
  .object({
    quantity: z.number().int().min(1).max(999),
  })
  .strict();
export type WebOrderProductionInput = z.infer<typeof webOrderProductionSchema>;
