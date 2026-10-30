import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { AuditService } from '@/modules/audit/audit.service';
import { CustomersService } from '@/modules/customers/customers.service';
import { QuotesService } from '@/modules/quotes/quotes.service';
import { StorefrontB2bCatalogService } from './storefront-b2b-catalog.service';

/** Un pedido B2B del sitio (F21·3, D18). Los precios los calcula el sistema. */
export const b2bOrderSchema = z.object({
  externalId: z.string().uuid(),
  /** La cuenta del sitio. */
  customerExternalId: z.string().min(1).max(120),
  note: z.string().trim().max(1000).default(''),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(9999),
        /** { pieza: color } de las piezas con color a elegir. */
        colors: z.record(z.string(), z.string()).default({}),
      }),
    )
    .min(1)
    .max(50),
});
export type B2bOrderInput = z.infer<typeof b2bOrderSchema>;

export interface PlacedB2bOrder {
  id: string;
  code: string;
  totalCents: number;
  replayed: boolean;
}

/**
 * El pedido de un cliente B2B entra como cotización enviada (F21·3): el equipo
 * la acepta o la rechaza. Se paga en efectivo al retirar (D19) y va al precio
 * de Venta Directa con factura del cliente (D18). Lo que manda el sitio no se
 * cree: cliente habilitado, productos que puede comprar y colores de cada línea.
 */
@Injectable()
export class StorefrontB2bOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly catalog: StorefrontB2bCatalogService,
    private readonly customers: CustomersService,
    private readonly quotes: QuotesService,
  ) {}

  async place(input: B2bOrderInput): Promise<PlacedB2bOrder> {
    const existing = await this.find(input.externalId);
    if (existing) return existing;

    const customer = await this.catalog.customerOf(input.customerExternalId);
    if (!customer) throw rejected('CATALOG_DISABLED', 'Esta cuenta no tiene catálogo.');
    for (const item of input.items) {
      if (!(await this.customers.canBuy(customer.id, item.productId))) {
        throw rejected('PRODUCT_NOT_ALLOWED', 'Hay un producto que no está en tu catálogo.', {
          productId: item.productId,
        });
      }
      await this.assertColors(item);
    }
    const channel = await this.prisma.channel.findFirst({
      where: { slug: 'directa', isActive: true },
      select: { id: true },
    });
    if (!channel) throw rejected('NO_CHANNEL', 'No está activo el canal Venta Directa.');

    try {
      const quote = await this.quotes.create(
        {
          customerId: customer.id,
          customerName: '',
          customerNotes: input.note || null,
          channelId: channel.id,
          withInvoice: true,
          externalId: input.externalId,
          items: input.items.map((i) => ({
            type: 'PRODUCT',
            productId: i.productId,
            quantity: i.quantity,
            filamentOverrides: i.colors,
          })),
        },
        null,
      );
      await this.audit.record({
        actorId: null,
        entity: 'Quote',
        entityId: quote.id,
        action: 'received-from-store',
        after: { code: quote.code, externalId: input.externalId, total: quote.total },
      });
      return {
        id: quote.id,
        code: quote.code,
        totalCents: Math.round(quote.total * 100),
        replayed: false,
      };
    } catch (error) {
      // Dos entregas simultáneas del mismo pedido: la segunda ve el que creó la primera.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.find(input.externalId);
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async find(externalId: string): Promise<PlacedB2bOrder | null> {
    const quote = await this.prisma.quote.findUnique({
      where: { externalId },
      select: { id: true, code: true, total: true },
    });
    return quote
      ? {
          id: quote.id,
          code: quote.code,
          totalCents: Math.round(dec(quote.total) * 100),
          replayed: true,
        }
      : null;
  }

  /** Cada pieza con línea de color lleva un color activo de esa línea (la regla de Producción). */
  private async assertColors(item: B2bOrderInput['items'][number]): Promise<void> {
    const pieces = await this.prisma.productPiece.findMany({
      where: { productId: item.productId },
      select: {
        id: true,
        name: true,
        defaultFilament: {
          select: { children: { where: { isActive: true }, select: { id: true } } },
        },
      },
    });
    const known = new Set(pieces.map((p) => p.id));
    if (Object.keys(item.colors).some((pieceId) => !known.has(pieceId))) {
      throw rejected('INVALID_COLOR', 'Hay un color de una pieza que no es de ese producto.');
    }
    for (const piece of pieces) {
      const colors = piece.defaultFilament?.children ?? [];
      const chosen = item.colors[piece.id];
      if (colors.length === 0) {
        if (chosen) throw rejected('INVALID_COLOR', `${piece.name} no tiene colores para elegir.`);
        continue;
      }
      if (!chosen) throw rejected('MISSING_COLOR', `Elegí el color de ${piece.name}.`);
      if (!colors.some((c) => c.id === chosen)) {
        throw rejected('INVALID_COLOR', `Ese color no está disponible para ${piece.name}.`);
      }
    }
  }
}

function rejected(reason: string, message: string, details: object = {}) {
  return new UnprocessableEntityException({ message, reason, ...details });
}
