import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelKind, Prisma, WebPriceState } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { PriceLine, WebPriceDto } from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PricingService, type ChannelPriceBlock } from '@/modules/pricing/pricing.service';

/** Slug del canal Venta Directa del seed: desempata si hubiera dos canales de ese tipo. */
const DIRECT_SALE_SLUG = 'directa';

export interface ComputedWebPrice {
  state: WebPriceState;
  /** Pesos, con dos decimales. null si no hay precio. */
  price: number | null;
  /** Por qué no hay precio, en palabras del panel. */
  reason: string | null;
  inputsHash: string;
}

/**
 * Precio publicado de un producto del sistema (plan F7·1, T5): el de Venta
 * Directa a cliente normal, cantidad 1. Sale del mismo cálculo que el panel de
 * precios del editor (`GET /products/:id/prices`), así que la tienda y el
 * sistema nunca muestran precios distintos.
 */
@Injectable()
export class WebPriceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async computeFor(productId: string): Promise<ComputedWebPrice> {
    let channels: ChannelPriceBlock[];
    try {
      ({ channels } = await this.pricing.forProduct(productId));
    } catch (error) {
      // El costeo corta con un mensaje para el admin (pieza sin filamento,
      // insumo sin precio…): es el motivo de que no haya precio.
      if (error instanceof HttpException) return noPrice(error.message);
      throw error;
    }

    const direct = channels.filter((c) => c.channelKind === ChannelKind.DIRECT_SALE);
    const block = direct.find((c) => c.channelSlug === DIRECT_SALE_SLUG) ?? direct[0];
    if (!block) {
      return noPrice(
        'Venta Directa deshabilitada para el producto: habilitala en la ficha del producto (Canales).',
      );
    }

    // Sin escalas, el precio base; con escalas (o en un llavero), la de cantidad 1.
    const line = block.base ?? block.tiers.find((t) => t.minQty === 1)?.line;
    if (!line) {
      return noPrice(
        block.tiers.length
          ? 'Las escalas de Venta Directa de su categoría no arrancan en 1 unidad: agregá una desde 1 en Categorías.'
          : 'La categoría no tiene markup (ni propio ni heredado): cargalo en Categorías.',
      );
    }
    if (line.missingCommission) {
      return noPrice('Falta la comisión de Venta Directa: cargala en Canales.');
    }
    if (!Number.isFinite(line.finalPrice) || line.finalPrice <= 0) {
      return noPrice('El cálculo no da un precio positivo: revisá los costos del producto.');
    }

    const price = Math.round(line.finalPrice * 100) / 100;
    return { state: WebPriceState.OK, price, reason: null, inputsHash: hash(line, price) };
  }

  /**
   * Recalcula y guarda el precio de un producto. No escribe si nada cambió;
   * si cambió el precio o el estado, deja el historial con la causa.
   */
  async refresh(productId: string, cause: string): Promise<{ changed: boolean }> {
    const computed = await this.computeFor(productId);
    const current = await this.prisma.webPrice.findUnique({ where: { productId } });
    if (current?.inputsHash === computed.inputsHash) return { changed: false };

    const previous = current?.price ?? null;
    const price = computed.price === null ? null : new Prisma.Decimal(computed.price);
    const priceChanged =
      !current ||
      current.state !== computed.state ||
      (previous === null ? price !== null : price === null || !previous.equals(price));

    await this.prisma.$transaction(async (tx) => {
      const data = {
        price,
        state: computed.state,
        reason: computed.reason,
        inputsHash: computed.inputsHash,
        computedAt: new Date(),
      };
      await tx.webPrice.upsert({
        where: { productId },
        create: { productId, ...data },
        update: data,
      });
      if (priceChanged) {
        await tx.webPriceHistory.create({ data: { productId, previous, price, cause } });
      }
    });
    return { changed: priceChanged };
  }

  /** Precio publicado y sus últimos cambios (plan F7·3). */
  async history(productId: string, limit = 50): Promise<WebPriceDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        webPrice: true,
        webPriceHistory: { orderBy: { changedAt: 'desc' }, take: limit },
      },
    });
    if (!product) throw new NotFoundException('Producto inexistente');
    const current = product.webPrice;
    return {
      productId,
      state: current?.state ?? null,
      price: decimalOrNull(current?.price),
      reason: current?.reason ?? null,
      computedAt: current?.computedAt.toISOString() ?? null,
      history: product.webPriceHistory.map((h) => ({
        changedAt: h.changedAt.toISOString(),
        previous: decimalOrNull(h.previous),
        price: decimalOrNull(h.price),
        cause: h.cause,
      })),
    };
  }
}

function decimalOrNull(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function noPrice(reason: string): ComputedWebPrice {
  return {
    state: WebPriceState.NO_PRICE,
    price: null,
    reason,
    inputsHash: hashOf({ state: WebPriceState.NO_PRICE, reason }),
  };
}

/** Lo que define el precio publicado: si no cambia, no se escribe nada. */
function hash(line: PriceLine, price: number): string {
  return hashOf({
    state: WebPriceState.OK,
    price,
    markupPct: line.markupPct,
    commissionPct: line.commissionPct,
    taxBurdenPct: line.taxBurdenPct,
  });
}

function hashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
