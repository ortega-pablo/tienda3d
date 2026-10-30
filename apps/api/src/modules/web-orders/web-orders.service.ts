import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, WebOrderFulfillment, WebOrderPayment, WebPaymentMethod } from '@prisma/client';
import type {
  WebOrderCancelInput,
  WebOrderCashConfirmInput,
  WebOrderDetailDto,
  WebOrderFulfillmentChangeInput,
  WebOrderListQuery,
  WebOrderProductionPlanDto,
  WebOrderSelectionDto,
  WebOrderSummaryDto,
  WebOrderTransferConfirmInput,
} from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { startOfDayInArgentina, yearInArgentina } from '@/common/utils/date';
import { DocumentCodeService } from '@/common/utils/document-code';
import { AuditService } from '@/modules/audit/audit.service';
import { OutboxService } from '@/modules/outbox/outbox.service';
import { ProductionsService } from '@/modules/productions/productions.service';
import { CatalogEvents } from '@/modules/web-catalog/catalog-events';
import {
  allowedFulfillments,
  canConfirmCash,
  canExtendPayment,
  canConfirmTransfer,
  canMoveFulfillment,
  canStartProduction,
  FULFILLMENT_LABEL,
  needsAttention,
  PAYMENT_EXTENSION_MS,
  productionColors,
} from './domain/order-flow';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "31/10/2026, 18:40" en la hora de Argentina. */
const argentinaDateTime = (d: Date) =>
  d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  });

/** "$ 39.450,00": los montos de los pedidos web van en centavos. */
const pesos = (cents: number) =>
  (cents / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const ORDER_CODE = /^W-\d{4}-\d{4,}$/;

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
 * (F14·5): cada paso respeta §5.6, queda en el historial y en auditoría, y le
 * llega al sitio por el outbox (F14·6), que se lo muestra al cliente.
 */
@Injectable()
export class WebOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: DocumentCodeService,
    private readonly audit: AuditService,
    private readonly events: CatalogEvents,
    private readonly outbox: OutboxService,
    private readonly productions: ProductionsService,
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
        ...(query.customer && { customerId: query.customer }),
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

  /** Por id o por código (`W-2026-0013`): el link del aviso de pedido nuevo usa el código (F14·9). */
  async get(idOrCode: string): Promise<WebOrderDetailDto> {
    const order = await this.prisma.webOrder.findUnique({
      where: ORDER_CODE.test(idOrCode) ? { code: idOrCode } : { id: idOrCode },
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
        paidAmountCents: true,
        paymentReference: true,
        paymentDueAt: true,
        customer: { select: { id: true, name: true, email: true, phone: true, taxId: true } },
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
      customer: {
        id: order.customer.id,
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone,
        document: order.customer.taxId,
      },
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
      paidAmountCents: order.paidAmountCents,
      paymentReference: order.paymentReference,
      paymentDueAt: order.paymentDueAt?.toISOString() ?? null,
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
        confirmCash: canConfirmCash(order),
        extendPayment: canExtendPayment(order) && order.paymentDueAt !== null,
        production: canStartProduction(order),
        fulfillment: allowedFulfillments(order).filter(
          (s): s is WebOrderDetailDto['actions']['fulfillment'][number] => s !== 'CANCELLED',
        ),
        cancel: allowedFulfillments(order).includes('CANCELLED'),
      },
    };
  }

  /** El admin vio el comprobante: el pago queda aprobado (D7). */
  /**
   * Transferencia acreditada (F22·3): el admin carga el monto que ve en el banco
   * y el número de operación. Si el monto no es el del pedido, no se confirma.
   */
  async confirmTransfer(
    id: string,
    input: WebOrderTransferConfirmInput,
    actorId: string,
  ): Promise<WebOrderDetailDto> {
    const order = await this.load(id);
    if (!canConfirmTransfer(order)) {
      throw new UnprocessableEntityException('Este pedido no está esperando una transferencia.');
    }
    return this.confirmManual(
      order,
      WebPaymentMethod.BANK_TRANSFER,
      input.amountCents,
      input.operationNumber,
      actorId,
    );
  }

  /** Cobro en efectivo al retirar (F22·3): el monto recibido tiene que ser el del pedido. */
  async confirmCash(
    id: string,
    input: WebOrderCashConfirmInput,
    actorId: string,
  ): Promise<WebOrderDetailDto> {
    const order = await this.load(id);
    if (!canConfirmCash(order)) {
      throw new UnprocessableEntityException('Este pedido no está esperando un pago en efectivo.');
    }
    return this.confirmManual(order, WebPaymentMethod.CASH, input.amountCents, null, actorId);
  }

  private async confirmManual(
    order: Awaited<ReturnType<WebOrdersService['load']>>,
    method: typeof WebPaymentMethod.BANK_TRANSFER | typeof WebPaymentMethod.CASH,
    amountCents: number,
    reference: string | null,
    actorId: string,
  ): Promise<WebOrderDetailDto> {
    if (amountCents !== order.totalCents) {
      throw new UnprocessableEntityException({
        message: `El monto (${pesos(amountCents)}) no coincide con el total del pedido (${pesos(order.totalCents)}). No se confirma: revisalo antes de entregar.`,
        reason: 'AMOUNT_MISMATCH',
      });
    }
    const paidAt = new Date();
    const message =
      method === WebPaymentMethod.CASH
        ? `Cobrado en efectivo: ${pesos(amountCents)}`
        : `Transferencia confirmada: ${pesos(amountCents)}, operación ${reference}`;
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, order, {
        paymentStatus: WebOrderPayment.APPROVED,
        paidAt,
        paymentChangedAt: paidAt,
        paidAmountCents: amountCents,
        paymentReference: reference,
      });
      await tx.webOrderEvent.create({
        data: { webOrderId: order.id, kind: 'payment', message, actorId },
      });
      // El sitio es el dueño del pago: lo aplica y avisa de vuelta (§5.5).
      await this.outbox.enqueue(tx, 'order.payment_confirmed_manually', {
        externalId: order.externalId,
        code: order.code,
        paidAt: paidAt.toISOString(),
        method,
        amountCents,
      });
    });
    await this.audit.record({
      actorId,
      entity: 'WebOrder',
      entityId: order.id,
      action: method === WebPaymentMethod.CASH ? 'cash-confirmed' : 'transfer-confirmed',
      before: { paymentStatus: order.paymentStatus },
      after: { paymentStatus: WebOrderPayment.APPROVED, paidAt, amountCents, reference },
    });
    return this.get(order.id);
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
      await this.fulfillmentChanged(tx, order, input.status, trackingCode);
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
    await this.cancelOrder(order, input.reason, actorId);
    return this.get(id);
  }

  /**
   * Cancela, devuelve lo reservado al stock y le avisa al sitio. `actorId` null:
   * lo canceló el sistema (un pedido que venció sin pagar, F22·4).
   */
  async cancelOrder(
    order: Awaited<ReturnType<WebOrdersService['load']>>,
    reason: string,
    actorId: string | null,
  ): Promise<void> {
    const id = order.id;
    const released = await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, order, {
        fulfillmentStatus: WebOrderFulfillment.CANCELLED,
        cancelReason: reason,
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
            `Cancelado: ${reason}` + (units > 0 ? ` · ${units} unidad(es) vuelven al stock` : ''),
          actorId,
        },
      });
      // El motivo es interno: el cliente ve que se canceló.
      await this.fulfillmentChanged(tx, order, WebOrderFulfillment.CANCELLED);
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
      after: { fulfillmentStatus: WebOrderFulfillment.CANCELLED, reason, released },
    });
  }

  /**
   * Un pedido sin pagar cuyo plazo venció (F22·4): se cancela como si lo hiciera
   * el admin, pero sin usuario. Devuelve si lo canceló.
   */
  async expireIfDue(id: string, now: Date): Promise<boolean> {
    const order = await this.load(id);
    if (!canExtendPayment(order) || !order.paymentDueAt || order.paymentDueAt > now) return false;
    try {
      await this.cancelOrder(order, 'Venció el plazo para pagar', null);
      return true;
    } catch (error) {
      // Lo pagaron o lo tocaron justo ahora: queda como esté.
      if (error instanceof ConflictException) return false;
      throw error;
    }
  }

  /**
   * 48 h más para pagar (F22·4): desde el vencimiento o, si ya pasó, desde ahora.
   * Vuelve a avisar al cliente 24 h antes y el sitio muestra el plazo nuevo.
   */
  async extendPayment(id: string, actorId: string): Promise<WebOrderDetailDto> {
    const order = await this.load(id);
    if (!canExtendPayment(order) || !order.paymentDueAt) {
      throw new UnprocessableEntityException(
        'Este pedido no tiene un plazo para pagar que extender.',
      );
    }
    const now = Date.now();
    const due = new Date(Math.max(now, order.paymentDueAt.getTime()) + PAYMENT_EXTENSION_MS);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, order, { paymentDueAt: due, paymentReminderAt: null });
      await tx.webOrderEvent.create({
        data: {
          webOrderId: id,
          kind: 'payment',
          message: `Plazo para pagar extendido hasta el ${argentinaDateTime(due)}`,
          actorId,
        },
      });
      await this.outbox.enqueue(tx, 'order.payment_deadline_changed', {
        externalId: order.externalId,
        code: order.code,
        paymentDueAt: due.toISOString(),
      });
    });
    await this.audit.record({
      actorId,
      entity: 'WebOrder',
      entityId: id,
      action: 'payment-extended',
      before: { paymentDueAt: order.paymentDueAt },
      after: { paymentDueAt: due },
    });
    return this.get(id);
  }

  /** Qué se va a fabricar para un ítem: producto, cantidad y el color de cada pieza (F14·7). */
  async productionPlan(orderId: string, itemId: string): Promise<WebOrderProductionPlanDto> {
    const { item, plan } = await this.loadProductionPlan(orderId, itemId);
    const colorOf = new Map(
      item.webVariant.selections.flatMap((s) => (s.material ? [[s.material.id, s.material]] : [])),
    );
    return {
      itemId: item.id,
      productId: item.productId,
      productName: item.product.name,
      variantLabel: item.variantLabel,
      quantity: item.quantity,
      suggestedQuantity: Math.max(1, item.quantity - item.reservedQuantity),
      pieces: item.product.pieces.map((p) => {
        const color = colorOf.get(plan.overrides[p.id] ?? '');
        return {
          pieceId: p.id,
          pieceName: p.name,
          colorName: color?.color ?? color?.name ?? null,
          colorHex: color?.colorHex ?? null,
        };
      }),
      missing: item.product.pieces.filter((p) => plan.missing.includes(p.id)).map((p) => p.name),
    };
  }

  /**
   * Genera la orden de producción de un ítem con los colores que eligió el
   * cliente y la vincula al ítem (F14·7). Una sola por ítem.
   */
  async createProductionOrder(
    orderId: string,
    itemId: string,
    quantity: number,
    actorId: string,
  ): Promise<WebOrderDetailDto> {
    const { order, item, plan } = await this.loadProductionPlan(orderId, itemId);
    if (!canStartProduction(order)) {
      throw new UnprocessableEntityException(
        'Solo se fabrica un pedido pagado que todavía no salió del taller.',
      );
    }
    if (item.productionOrderId) {
      throw new ConflictException('Este ítem ya tiene su orden de producción.');
    }
    if (plan.missing.length) {
      const names = item.product.pieces
        .filter((p) => plan.missing.includes(p.id))
        .map((p) => p.name);
      throw new UnprocessableEntityException(
        `La publicación no define el color de: ${names.join(', ')}. Generá la orden desde Producción.`,
      );
    }
    const production = await this.productions.create(
      {
        productId: item.productId,
        quantity,
        filamentOverrides: plan.overrides,
        notes: `Pedido web ${order.code} · ${item.productName} (${item.variantLabel})`,
      },
      actorId,
    );
    const linked = await this.prisma.webOrderItem.updateMany({
      where: { id: item.id, productionOrderId: null },
      data: { productionOrderId: production.id },
    });
    if (linked.count === 0) {
      // Otro admin la generó a la vez: la nuestra no queda suelta.
      await this.productions.setStatus(production.id, 'CANCELLED', actorId);
      throw new ConflictException('Este ítem ya tiene su orden de producción.');
    }
    await this.prisma.webOrderEvent.create({
      data: {
        webOrderId: order.id,
        kind: 'production',
        message: `Orden de producción ${production.code}: ${item.productName} × ${quantity}`,
        actorId,
      },
    });
    await this.audit.record({
      actorId,
      entity: 'WebOrder',
      entityId: order.id,
      action: 'production-order',
      after: {
        itemId: item.id,
        productionOrderId: production.id,
        quantity,
        filamentOverrides: plan.overrides,
      },
    });
    return this.get(order.id);
  }

  private async loadProductionPlan(orderId: string, itemId: string) {
    const order = await this.load(orderId);
    const item = await this.prisma.webOrderItem.findFirst({
      where: { id: itemId, webOrderId: orderId },
      include: {
        product: {
          select: {
            name: true,
            pieces: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                name: true,
                defaultFilament: { select: { _count: { select: { children: true } } } },
              },
            },
          },
        },
        webVariant: {
          select: {
            selections: {
              where: { colorOptionId: { not: null }, materialId: { not: null } },
              select: {
                material: { select: { id: true, name: true, color: true, colorHex: true } },
                colorOption: { select: { pieces: { select: { pieceId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Ítem inexistente');
    const plan = productionColors(
      item.product.pieces.map((p) => ({
        id: p.id,
        needsColor: (p.defaultFilament?._count.children ?? 0) > 0,
      })),
      item.webVariant.selections.map((s) => ({
        materialId: s.material!.id,
        pieceIds: s.colorOption!.pieces.map((p) => p.pieceId),
      })),
    );
    return { order, item, plan };
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
        code: true,
        externalId: true,
        paymentMethod: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        deliveryMethod: true,
        totalCents: true,
        paymentDueAt: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido inexistente');
    return order;
  }

  /**
   * Aviso al sitio de la nueva etapa (§5.5). `changedAt` ordena los avisos: el
   * sitio no aplica uno más viejo que el último que aplicó.
   */
  private fulfillmentChanged(
    tx: Prisma.TransactionClient,
    order: { externalId: string; code: string },
    status: WebOrderFulfillment,
    trackingCode?: string | null,
  ): Promise<void> {
    return this.outbox.enqueue(tx, 'order.fulfillment_changed', {
      externalId: order.externalId,
      code: order.code,
      status,
      ...(trackingCode !== undefined && { trackingCode }),
      changedAt: new Date().toISOString(),
    });
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
