import { Injectable } from '@nestjs/common';
import { WebOrderPayment } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '@/modules/audit/audit.service';
import { InboundEventsService } from '@/modules/inbound-events/inbound-events.service';
import { pesos } from '@/modules/web-orders/domain/order-flow';

/** Lo que el sitio avisa de un pedido (§5.5): cómo va el pago y lo que hay que mirar. */
export const webOrderEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('payment_updated'),
    paymentStatus: z.nativeEnum(WebOrderPayment),
    paidAt: z.coerce.date().nullable(),
    /** Cuánto se devolvió del pago hasta ahora (F22·5). */
    refundedCents: z.number().int().min(0).optional(),
    /** Cuándo cambió en el sitio: ordena los avisos. */
    changedAt: z.coerce.date(),
  }),
  /** Un pago que necesita a una persona (F22·5): contracargo, cobro tardío o que no cierra. */
  z.object({
    type: z.literal('payment_alert'),
    alert: z.string().min(1).max(40),
    message: z.string().min(1).max(500),
    at: z.coerce.date(),
  }),
]);
export type WebOrderEventInput = z.infer<typeof webOrderEventSchema>;

export interface WebOrderEventResult {
  /** Cambió el pago en el sistema. */
  applied: boolean;
  /** Por qué no: el pedido no está en el sistema o el aviso es más viejo que lo que hay. */
  ignored?: 'UNKNOWN_ORDER' | 'STALE';
  [key: string]: string | boolean | undefined;
}

const PAYMENT_MESSAGE: Record<WebOrderPayment, string> = {
  PENDING: 'Pago pendiente en la tienda',
  AWAITING_TRANSFER: 'Esperando la transferencia',
  AWAITING_CASH: 'A pagar en efectivo en el local',
  APPROVED: 'Pago aprobado en la tienda',
  REJECTED: 'Pago rechazado en la tienda',
  REFUNDED: 'Pago reembolsado',
  DISPUTED: 'Contracargo: pago en disputa',
};

/**
 * El pago del pedido lo maneja el sitio (§5.6): el sistema refleja lo que le
 * avisa, para que el panel sepa qué se puede preparar (F14·6). Repetir un
 * aviso no hace nada (Idempotency-Key) y uno viejo no pisa uno nuevo.
 */
@Injectable()
export class StorefrontOrderEventsService {
  constructor(
    private readonly inbound: InboundEventsService,
    private readonly audit: AuditService,
  ) {}

  async apply(externalId: string, input: WebOrderEventInput, idempotencyKey: string) {
    if (input.type === 'payment_alert') return this.alert(externalId, input, idempotencyKey);
    let before: WebOrderPayment | null = null;
    let orderId: string | null = null;
    const outcome = await this.inbound.once<WebOrderEventResult>(
      'storefront:order-events',
      idempotencyKey,
      async (tx) => {
        const order = await tx.webOrder.findUnique({
          where: { externalId },
          select: { id: true, paymentStatus: true, paymentChangedAt: true, refundedCents: true },
        });
        // Se confirma igual: el sitio no tiene por qué reintentarlo 48 h.
        if (!order) return { applied: false, ignored: 'UNKNOWN_ORDER' };
        if (order.paymentChangedAt && order.paymentChangedAt >= input.changedAt) {
          return { applied: false, ignored: 'STALE' };
        }
        const refundedCents = input.refundedCents ?? order.refundedCents;
        const statusChanged = order.paymentStatus !== input.paymentStatus;
        const changed = statusChanged || refundedCents !== order.refundedCents;
        await tx.webOrder.update({
          where: { id: order.id },
          data: {
            paymentStatus: input.paymentStatus,
            paymentChangedAt: input.changedAt,
            refundedCents,
            ...(input.paidAt && { paidAt: input.paidAt }),
          },
        });
        if (changed) {
          await tx.webOrderEvent.create({
            data: {
              webOrderId: order.id,
              kind: 'payment',
              // Un reembolso parcial no cambia el estado: se dice cuánto va.
              message: statusChanged
                ? PAYMENT_MESSAGE[input.paymentStatus]
                : `Reembolsado hasta ahora: ${pesos(refundedCents)}`,
            },
          });
          before = order.paymentStatus;
          orderId = order.id;
        }
        return { applied: changed };
      },
    );
    if (orderId && !outcome.replayed) {
      await this.audit.record({
        actorId: null,
        entity: 'WebOrder',
        entityId: orderId,
        action: 'payment-updated',
        before: { paymentStatus: before },
        after: { paymentStatus: input.paymentStatus, refundedCents: input.refundedCents },
      });
    }
    return { ...outcome.result, replayed: outcome.replayed };
  }

  /** Va al historial del pedido, donde el panel la destaca. */
  private async alert(
    externalId: string,
    input: Extract<WebOrderEventInput, { type: 'payment_alert' }>,
    idempotencyKey: string,
  ) {
    let orderId: string | null = null;
    const outcome = await this.inbound.once<WebOrderEventResult>(
      'storefront:order-events',
      idempotencyKey,
      async (tx) => {
        const order = await tx.webOrder.findUnique({
          where: { externalId },
          select: { id: true },
        });
        if (!order) return { applied: false, ignored: 'UNKNOWN_ORDER' };
        await tx.webOrderEvent.create({
          data: { webOrderId: order.id, kind: 'alert', message: input.message },
        });
        orderId = order.id;
        return { applied: true };
      },
    );
    if (orderId && !outcome.replayed) {
      await this.audit.record({
        actorId: null,
        entity: 'WebOrder',
        entityId: orderId,
        action: 'payment-alert',
        after: { alert: input.alert, message: input.message, at: input.at },
      });
    }
    return { ...outcome.result, replayed: outcome.replayed };
  }
}
