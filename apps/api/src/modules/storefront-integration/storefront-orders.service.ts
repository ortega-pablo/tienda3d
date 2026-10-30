import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogEvents } from '@/modules/web-catalog/catalog-events';
import { paymentStartIssue } from '@/modules/web-orders/domain/order-flow';
import { WebOrdersService } from '@/modules/web-orders/web-orders.service';
import { webCustomerSchema, WebCustomersService } from './web-customers.service';

const selectionSchema = z.object({
  kind: z.enum(['member', 'color', 'attribute']),
  label: z.string().max(80),
  value: z.string().max(120),
  valueKey: z.string().max(64),
  colorHex: z.string().max(16).nullable(),
});

/** Un pedido del sitio (F14·3). Los montos van en centavos, como en storefront_v1. */
export const webOrderSchema = z
  .object({
    externalId: z.string().uuid(),
    number: z.number().int().positive(),
    customer: webCustomerSchema,
    paymentMethod: z.enum(['MERCADOPAGO', 'BANK_TRANSFER', 'CASH', 'MODO', 'GOCUOTAS']),
    paymentStatus: z.enum(['PENDING', 'AWAITING_TRANSFER', 'AWAITING_CASH']),
    deliveryMethod: z.enum(['PICKUP', 'SHIPPING']),
    shipping: z
      .object({
        street: z.string().max(120),
        number: z.string().max(20),
        apartment: z.string().max(40),
        city: z.string().max(80),
        province: z.string().max(4),
        postalCode: z.string().max(10),
      })
      .nullable(),
    shippingLabel: z.string().max(120),
    shippingCents: z.number().int().nonnegative().nullable(),
    subtotalCents: z.number().int().nonnegative(),
    totalCents: z.number().int().nonnegative(),
    customerNote: z.string().max(1000).default(''),
    placedAt: z.coerce.date(),
    items: z
      .array(
        z.object({
          webVariantId: z.string().min(1),
          quantity: z.number().int().min(1).max(999),
          unitPriceCents: z.number().int().nonnegative(),
          productName: z.string().max(160),
          variantLabel: z.string().max(200),
          selections: z.array(selectionSchema).max(10).default([]),
        }),
      )
      .min(1)
      .max(30),
  })
  .superRefine((order, ctx) => {
    const issue = paymentStartIssue(order);
    if (issue)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paymentMethod'], message: issue });
  });
export type WebOrderInput = z.infer<typeof webOrderSchema>;

/** Lo que el sitio ve de una variante: la vista storefront_v1.variants (contrato). */
interface SellableRow {
  id: string;
  product_id: string;
  price_cents: number;
  availability: 'MADE_TO_ORDER' | 'STOCK_ONLY' | 'STOCK_THEN_ORDER';
  max_per_order: number;
}

export interface PlacedOrder {
  code: string;
  webOrderId: string;
  replayed: boolean;
}

/**
 * Registra un pedido del sitio (plan F14·3, D2). En una transacción: valida
 * cada línea contra lo que el sitio puede vender (la misma vista que lee), que
 * el precio no haya cambiado y que alcance el stock; reserva el stock de las
 * variantes que lo llevan y le da el código W-AAAA-NNNN. Idempotente por el id
 * del pedido en el sitio: repetir la llamada devuelve el mismo código.
 */
@Injectable()
export class StorefrontOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: CatalogEvents,
    private readonly orders: WebOrdersService,
    private readonly customers: WebCustomersService,
  ) {}

  async place(input: WebOrderInput): Promise<PlacedOrder> {
    const existing = await this.find(input.externalId);
    if (existing) return existing;
    try {
      const placed = await this.prisma.$transaction((tx) => this.create(tx, input));
      await this.audit.record({
        actorId: null,
        entity: 'WebOrder',
        entityId: placed.webOrderId,
        action: 'placed',
        after: { code: placed.code, externalId: input.externalId, totalCents: input.totalCents },
      });
      return placed;
    } catch (error) {
      // Dos llamadas simultáneas del mismo pedido: la segunda ve el que creó la primera.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.find(input.externalId);
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async find(externalId: string): Promise<PlacedOrder | null> {
    const order = await this.prisma.webOrder.findUnique({
      where: { externalId },
      select: { id: true, code: true },
    });
    return order ? { code: order.code, webOrderId: order.id, replayed: true } : null;
  }

  private async create(tx: Prisma.TransactionClient, input: WebOrderInput): Promise<PlacedOrder> {
    const ids = [...new Set(input.items.map((i) => i.webVariantId))];
    const sellable = await tx.$queryRaw<SellableRow[]>`
      SELECT id, product_id, price_cents, availability, max_per_order
      FROM storefront_v1.variants WHERE id = ANY(${ids})`;
    const byId = new Map(sellable.map((r) => [r.id, r]));

    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new UnprocessableEntityException({
        message: 'Hay productos que ya no están a la venta.',
        reason: 'NOT_AVAILABLE',
        webVariantIds: missing,
      });
    }
    const changed = input.items
      .filter((i) => byId.get(i.webVariantId)!.price_cents !== i.unitPriceCents)
      .map((i) => ({
        webVariantId: i.webVariantId,
        priceCents: byId.get(i.webVariantId)!.price_cents,
      }));
    if (changed.length) {
      throw new ConflictException({
        message: 'Cambió el precio de algún producto.',
        reason: 'PRICE_CHANGED',
        prices: changed,
      });
    }

    // Stock: las filas de las variantes quedan bloqueadas hasta el final de la
    // transacción (en orden, para no trabarse con otra compra simultánea).
    const locked = await tx.$queryRaw<Array<{ id: string; stockQuantity: number }>>`
      SELECT id, "stockQuantity" FROM web_variants WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
    const stock = new Map(locked.map((r) => [r.id, r.stockQuantity]));
    const reserved = new Map<string, number>();
    const shortages: Array<{ webVariantId: string; available: number }> = [];
    for (const item of input.items) {
      const row = byId.get(item.webVariantId)!;
      const left = (stock.get(item.webVariantId) ?? 0) - (reserved.get(item.webVariantId) ?? 0);
      if (item.quantity > row.max_per_order) {
        shortages.push({ webVariantId: item.webVariantId, available: row.max_per_order });
        continue;
      }
      if (row.availability === 'MADE_TO_ORDER') continue;
      if (row.availability === 'STOCK_ONLY' && left < item.quantity) {
        shortages.push({ webVariantId: item.webVariantId, available: Math.max(0, left) });
        continue;
      }
      // Con "stock y después a pedido", lo que hay sale ya y el resto se fabrica.
      const take = Math.min(Math.max(0, left), item.quantity);
      reserved.set(item.webVariantId, (reserved.get(item.webVariantId) ?? 0) + take);
    }
    if (shortages.length) {
      throw new ConflictException({
        message: 'No alcanza el stock de algún producto.',
        reason: 'OUT_OF_STOCK',
        items: shortages,
      });
    }
    for (const [id, quantity] of reserved) {
      if (quantity > 0) {
        await tx.webVariant.update({
          where: { id },
          data: { stockQuantity: { decrement: quantity } },
        });
      }
    }

    const variants = await tx.webVariant.findMany({
      where: { id: { in: ids } },
      select: { id: true, sku: true, webProductId: true, member: { select: { productId: true } } },
    });
    const variant = new Map(variants.map((v) => [v.id, v]));
    const { customerId } = await this.customers.apply(tx, input.customer);
    const code = await this.orders.nextCode(tx, input.placedAt);
    const reservedLeft = new Map(reserved);

    const order = await tx.webOrder.create({
      data: {
        code,
        externalId: input.externalId,
        number: input.number,
        customerId,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        deliveryMethod: input.deliveryMethod,
        ...(input.shipping && {
          shippingStreet: input.shipping.street,
          shippingNumber: input.shipping.number,
          shippingApartment: input.shipping.apartment || null,
          shippingCity: input.shipping.city,
          shippingProvince: input.shipping.province,
          shippingPostalCode: input.shipping.postalCode,
        }),
        shippingLabel: input.shippingLabel,
        shippingCents: input.shippingCents,
        subtotalCents: input.subtotalCents,
        totalCents: input.totalCents,
        customerNote: input.customerNote,
        placedAt: input.placedAt,
        items: {
          create: input.items.map((i) => {
            const take = Math.min(reservedLeft.get(i.webVariantId) ?? 0, i.quantity);
            reservedLeft.set(i.webVariantId, (reservedLeft.get(i.webVariantId) ?? 0) - take);
            const v = variant.get(i.webVariantId)!;
            return {
              webVariantId: i.webVariantId,
              productId: v.member.productId,
              sku: v.sku,
              productName: i.productName,
              variantLabel: i.variantLabel,
              selections: i.selections,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              lineTotalCents: i.unitPriceCents * i.quantity,
              reservedQuantity: take,
            };
          }),
        },
        events: {
          create: { kind: 'created', message: `Pedido #${input.number} recibido de la tienda` },
        },
      },
    });

    // El stock cambió lo que muestra la tienda.
    const products = new Set(
      [...reserved.entries()].filter(([, q]) => q > 0).map(([id]) => variant.get(id)!.webProductId),
    );
    for (const webProductId of products) await this.events.productChanged(tx, webProductId);

    return { code, webOrderId: order.id, replayed: false };
  }
}
