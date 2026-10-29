import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, WebOrderFulfillment, WebOrderPayment } from '@prisma/client';
import type {
  WebOrderCancelInput,
  WebOrderDetailDto,
  WebOrderFulfillmentChangeInput,
  WebOrderListQuery,
  WebOrderSelectionDto,
  WebOrderSummaryDto,
} from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { startOfDayInArgentina, yearInArgentina } from '@/common/utils/date';
import { DocumentCodeService } from '@/common/utils/document-code';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogEvents } from '@/modules/web-catalog/catalog-events';
import {
  allowedFulfillments,
  canConfirmTransfer,
  canMoveFulfillment,
  FULFILLMENT_LABEL,
  needsAttention,
} from './domain/order-flow';

const DAY_MS = 24 * 60 * 60 * 1000;

const SUMMARY_SELECT = {
  id: true,
  code: true,
  number: true,
  paymentMethod: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  deliveryMethod: true,
  totalCents: true,
  placedAt: true,
  customer: { select: { id: true, name: true, email: true, phone: true } },
  items: { select: { quantity: true } },
} satisfies Prisma.WebOrderSelect;

type SummaryRow = Prisma.WebOrderGetPayload<{ select: typeof SUMMARY_SELECT }>;

/** Lo que espera al taller (ver `needsAttention`), como filtro de la base. */
const ATTENTION_WHERE: Prisma.WebOrderWhereInput = {
  fulfillmentStatus: WebOrderFulfillment.RECEIVED,
  paymentStatus: { in: [WebOrderPayment.AWAITING_TRANSFER, WebOrderPayment.APPROVED] },
};

/**
 * Pedidos de la tienda online en el sistema (plan F14). El código es
 * `W-AAAA-NNNN`, correlativo por año de Argentina y libre de carreras. Desde el
 * panel el admin confirma la transferencia, mueve la preparación y cancela
 * (F14·5): cada paso respeta §5.6, queda en el historial y en auditoría.
 */
@Injectable()
export class WebOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: DocumentCodeService,
    private readonly audit: AuditService,
    private readonly events: CatalogEvents,
  ) {}

  /** El próximo código; dentro de la transacción que crea el pedido. */
  nextCode(tx?: Prisma.TransactionClient, at = new Date()): Promise<string> {
    return this.codes.next('WEB_ORDER', 'W', yearInArgentina(at), 4, tx);
  }

  async list(query: WebOrderListQuery): Promise<WebOrderSummaryDto[]> {
    const placedAt: Prisma.DateTimeFilter = {};
    if (query.from) placedAt.gte = startOfDayInArgentina(query.from);
    if (query.to) placedAt.lt = new Date(startOfDayInArgentina(query.to).getTime() + DAY_MS);
    const rows = await this.prisma.webOrder.findMany({
      where: {
        ...(query.attention && ATTENTION_WHERE),
        ...(query.fulfillment && { fulfillmentStatus: query.fulfillment }),
        ...(query.payment && { paymentStatus: query.payment }),
        ...(query.delivery && { deliveryMethod: query.delivery }),
        ...((query.from || query.to) && { placedAt }),
      },
      select: SUMMARY_SELECT,
      orderBy: { placedAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.summary(r));
  }

  /** Para el contador del menú. */
  async attentionCount(): Promise<number> {
    return this.prisma.webOrder.count({ where: ATTENTION_WHERE });
  }

  async get(id: string): Promise<WebOrderDetailDto> {
    const order = await this.prisma.webOrder.findUnique({
      where: { id },
      select: {
        ...SUMMARY_SELECT,
        shippingStreet: true,
        shippingNumber: true,
        shippingApartment: true,
        shippingCity: true,
        shippingProvince: true,
        shippingPostalCode: true,
        shippingLabel: true,
        shippingCents: true,
        subtotalCents: true,
        customerNote: true,
        trackingCode: true,
        internalNotes: true,
        cancelReason: true,
        paidAt: true,
        items: {
          orderBy: { id: 'asc' },
          include: { productionOrder: { select: { code: true } } },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido inexistente');

    return {
      ...this.summary(order),
      customer: order.customer,
      shipping: order.shippingStreet
        ? {
            street: order.shippingStreet,
            number: order.shippingNumber ?? '',
            apartment: order.shippingApartment,
            city: order.shippingCity ?? '',
            province: order.shippingProvince ?? '',
            postalCode: order.shippingPostalCode ?? '',
          }
        : null,
      shippingLabel: order.shippingLabel,
      shippingCents: order.shippingCents,
      subtotalCents: order.subtotalCents,
      customerNote: order.customerNote,
      trackingCode: order.trackingCode,
      internalNotes: order.internalNotes,
      cancelReason: order.cancelReason,
      paidAt: order.paidAt?.toISOString() ?? null,
      items: order.items.map((i) => ({
        id: i.id,
        webVariantId: i.webVariantId,
        productId: i.productId,
        sku: i.sku,
        productName: i.productName,
        variantLabel: i.variantLabel,
        selections: i.selections as unknown as WebOrderSelectionDto[],
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        lineTotalCents: i.lineTotalCents,
        reservedQuantity: i.reservedQuantity,
        productionOrderId: i.productionOrderId,
        productionOrderCode: i.productionOrder?.code ?? null,
      })),
      events: order.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        message: e.message,
        actorName: e.actor?.name ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      actions: {
        confirmTransfer: canConfirmTransfer(order),
        fulfillment: allowedFulfillments(order).filter(
          (s): s is WebOrderDetailDto['actions']['fulfillment'][number] => s !== 'CANCELLED',
        ),
        cancel: allowedFulfillments(order).includes('CANCELLED'),
      },
    };
  }

  /** El admin vio el comprobante: el pago queda aprobado (D7). */
  async confirmTransfer(id: string, actorId: string): Promise<WebOrderDetailDto> {
    const order = await this.load(id);
    if (!canConfirmTransfer(order)) {
      throw new UnprocessableEntityException('Este pedido no está esperando una transferencia.');
    }
    const paidAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, order, { paymentStatus: WebOrderPayment.APPROVED, paidAt });
      await tx.webOrderEvent.create({
        data: { webOrderId: id, kind: 'payment', message: 'Transferencia confirmada', actorId },
      });
    });
    await this.audit.record({
      actorId,
      entity: 'WebOrder',
      entityId: id,
      action: 'transfer-confirmed',
      before: { paymentStatus: order.paymentStatus },
      after: { paymentStatus: WebOrderPayment.APPROVED, paidAt },
    });
    return this.get(id);
  }

  /** Un paso de la preparación (preparar, listo, enviado, entregado). */
  async changeFulfillment(
    id: string,
    input: WebOrderFulfillmentChangeInput,
    actorId: string,
  ): Promise<WebOrderDetailDto> {
    const order = await this.load(id);
    if (!canMoveFulfillment(order, input.status)) {
      throw new UnprocessableEntityException(
        order.paymentStatus !== WebOrderPayment.APPROVED
          ? 'El pedido todavía no está pagado.'
          : `Un pedido ${FULFILLMENT_LABEL[order.fulfillmentStatus].toLowerCase()} no puede pasar a ${FULFILLMENT_LABEL[input.status].toLowerCase()}.`,
      );
    }
    const trackingCode =
      input.status === WebOrderFulfillment.SHIPPED ? input.trackingCode || null : undefined;
    const message =
      input.status === WebOrderFulfillment.SHIPPED && trackingCode
        ? `Enviado — seguimiento ${trackingCode}`
        : FULFILLMENT_LABEL[input.status];
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, order, {
        fulfillmentStatus: input.status,
        ...(trackingCode !== undefined && { trackingCode }),
      });
      await tx.webOrderEvent.create({
        data: { webOrderId: id, kind: 'fulfillment', message, actorId },
      });
    });
    await this.audit.record({
      actorId,
      entity: 'WebOrder',
      entityId: id,
      action: 'fulfillment-change',
      before: { fulfillmentStatus: order.fulfillmentStatus },
      after: { fulfillmentStatus: input.status, ...(trackingCode && { trackingCode }) },
    });
    return this.get(id);
  }

  /**
   * Cancela el pedido y devuelve al stock lo que se había reservado (§5.6). Si
   * ya estaba pagado, el reembolso se hace aparte (Mercado Pago o transferencia).
   */
  async cancel(
    id: string,
    input: WebOrderCancelInput,
    actorId: string,
  ): Promise<WebOrderDetailDto> {
    const order = await this.load(id);
    if (!allowedFulfillments(order).includes(WebOrderFulfillment.CANCELLED)) {
      throw new UnprocessableEntityException(
        `Un pedido ${FULFILLMENT_LABEL[order.fulfillmentStatus].toLowerCase()} no se puede cancelar.`,
      );
    }
    const released = await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, order, {
        fulfillmentStatus: WebOrderFulfillment.CANCELLED,
        cancelReason: input.reason,
      });
      const items = await tx.webOrderItem.findMany({
        where: { webOrderId: id, reservedQuantity: { gt: 0 } },
        select: {
          id: true,
          webVariantId: true,
          reservedQuantity: true,
          webVariant: { select: { webProductId: true } },
        },
      });
      for (const item of items) {
        await tx.webVariant.update({
          where: { id: item.webVariantId },
          data: { stockQuantity: { increment: item.reservedQuantity } },
        });
        await tx.webOrderItem.update({ where: { id: item.id }, data: { reservedQuantity: 0 } });
      }
      const units = items.reduce((n, i) => n + i.reservedQuantity, 0);
      await tx.webOrderEvent.create({
        data: {
          webOrderId: id,
          kind: 'cancelled',
          message:
            `Cancelado: ${input.reason}` +
            (units > 0 ? ` · ${units} unidad(es) vuelven al stock` : ''),
          actorId,
        },
      });
      // El stock devuelto cambia lo que muestra la tienda.
      for (const webProductId of new Set(items.map((i) => i.webVariant.webProductId))) {
        await this.events.productChanged(tx, webProductId);
      }
      return items.map((i) => ({ webVariantId: i.webVariantId, quantity: i.reservedQuantity }));
    });
    await this.audit.record({
      actorId,
      entity: 'WebOrder',
      entityId: id,
      action: 'cancelled',
      before: { fulfillmentStatus: order.fulfillmentStatus },
      after: { fulfillmentStatus: WebOrderFulfillment.CANCELLED, reason: input.reason, released },
    });
    return this.get(id);
  }

  async updateNotes(
    id: string,
    internalNotes: string,
    actorId: string,
  ): Promise<WebOrderDetailDto> {
    const order = await this.prisma.webOrder.findUnique({
      where: { id },
      select: { internalNotes: true },
    });
    if (!order) throw new NotFoundException('Pedido inexistente');
    await this.prisma.webOrder.update({ where: { id }, data: { internalNotes } });
    await this.audit.record({
      actorId,
      entity: 'WebOrder',
      entityId: id,
      action: 'notes',
      before: { internalNotes: order.internalNotes },
      after: { internalNotes },
    });
    return this.get(id);
  }

  private async load(id: string) {
    const order = await this.prisma.webOrder.findUnique({
      where: { id },
      select: {
        id: true,
        paymentMethod: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        deliveryMethod: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido inexistente');
    return order;
  }

  /** Aplica el cambio solo si nadie lo movió mientras tanto (dos pestañas, dos admins). */
  private async claim(
    tx: Prisma.TransactionClient,
    order: { id: string; paymentStatus: WebOrderPayment; fulfillmentStatus: WebOrderFulfillment },
    data: Prisma.WebOrderUpdateManyMutationInput,
  ): Promise<void> {
    const claimed = await tx.webOrder.updateMany({
      where: {
        id: order.id,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
      },
      data,
    });
    if (claimed.count === 0) {
      throw new ConflictException('El pedido cambió mientras tanto. Recargá la página.');
    }
  }

  private summary(r: SummaryRow): WebOrderSummaryDto {
    return {
      id: r.id,
      code: r.code,
      number: r.number,
      customerName: r.customer.name,
      customerEmail: r.customer.email,
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      fulfillmentStatus: r.fulfillmentStatus,
      deliveryMethod: r.deliveryMethod,
      totalCents: r.totalCents,
      units: r.items.reduce((n, i) => n + i.quantity, 0),
      placedAt: r.placedAt.toISOString(),
      needsAttention: needsAttention(r),
    };
  }
}
