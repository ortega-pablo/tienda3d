import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuoteStatus, QuoteType } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { CostingService } from '../costing/costing.service';
import { PricingEngine } from '../pricing/pricing.engine';
import { PricingService } from '../pricing/pricing.service';
import { ProductTiersService } from '../products/product-tiers.service';
import type {
  AdhocItemPayload,
  QuoteCreateInput,
  QuoteDto,
  QuoteItemDto,
  QuoteItemInput,
  QuoteSummaryDto,
} from './quotes.types';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly pricing: PricingService,
    private readonly engine: PricingEngine,
    private readonly tiers: ProductTiersService,
    private readonly audit: AuditService,
  ) {}

  async list(filters: { type?: QuoteType } = {}): Promise<QuoteSummaryDto[]> {
    const quotes = await this.prisma.quote.findMany({
      where: filters.type ? { type: filters.type } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        items: { select: { id: true } },
        channel: { select: { name: true } },
      },
    });
    return quotes.map((q) => ({
      id: q.id,
      code: q.code,
      type: q.type,
      status: q.status,
      customerName: q.customerName,
      channelName: q.channel?.name ?? null,
      total: dec(q.total),
      itemCount: q.items.length,
      createdAt: q.createdAt,
    }));
  }

  async get(id: string): Promise<QuoteDto> {
    const q = await this.prisma.quote.findUnique({
      where: { id },
      include: { items: true, channel: { select: { name: true } } },
    });
    if (!q) throw new NotFoundException('Cotización inexistente');
    return this.toDto(q);
  }

  async create(input: QuoteCreateInput, actorId: string): Promise<QuoteDto> {
    if (input.items.length === 0) {
      throw new BadRequestException('La cotización debe tener al menos un ítem');
    }

    // Enforce homogeneous quote: either all PRODUCT or all ADHOC items.
    const itemTypes = new Set(input.items.map((i) => i.type));
    if (itemTypes.size > 1) {
      throw new BadRequestException(
        'Una cotización debe contener solo productos del catálogo o solo piezas instantáneas, no mezclados',
      );
    }
    const quoteType: QuoteType =
      input.items[0]?.type === 'ADHOC' ? QuoteType.ADHOC : QuoteType.PRODUCT;

    const code = await this.nextCode(quoteType);
    const itemsData = await Promise.all(
      input.items.map((item) => this.buildItemRow(item, input.channelId)),
    );
    const subtotal = itemsData.reduce((acc, i) => acc + Number(i.lineTotal), 0);
    const discount = input.discount ?? 0;
    const total = Math.max(subtotal - discount, 0);

    const created = await this.prisma.quote.create({
      data: {
        code,
        type: quoteType,
        status: QuoteStatus.DRAFT,
        customerName: input.customerName,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        customerNotes: input.customerNotes ?? null,
        channelId: input.channelId,
        withInvoice: input.withInvoice ?? false,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        notes: input.notes ?? null,
        subtotal,
        discount,
        total,
        createdById: actorId,
        items: { create: itemsData },
      },
      include: { items: true, channel: { select: { name: true } } },
    });
    return this.toDto(created);
  }

  async setStatus(id: string, status: QuoteStatus, actorId: string): Promise<QuoteDto> {
    const existing = await this.prisma.quote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cotización inexistente');
    if (!this.isValidTransition(existing.status, status)) {
      throw new BadRequestException(`Transición no válida ${existing.status} → ${status}`);
    }
    await this.prisma.quote.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorId,
      entity: 'Quote',
      entityId: id,
      action: 'status-change',
      before: { status: existing.status },
      after: { status },
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const q = await this.prisma.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Cotización inexistente');
    if (q.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('Solo se pueden eliminar cotizaciones en borrador');
    }
    await this.prisma.quote.delete({ where: { id } });
  }

  /** Compute (cost, price, profit) for an arbitrary item without persisting — used by the live preview. */
  async previewItem(
    item: QuoteItemInput,
    channelId: string | null,
  ): Promise<{
    unitCost: number;
    unitPrice: number;
    unitProfit: number;
    lineTotal: number;
    warnings: string[];
  }> {
    const row = await this.buildItemRow(item, channelId);
    return {
      unitCost: Number(row.unitCost),
      unitPrice: Number(row.unitPrice),
      unitProfit: Number(row.unitProfit ?? 0),
      lineTotal: Number(row.lineTotal),
      warnings: [],
    };
  }

  // ----- internals -----

  private async buildItemRow(
    item: QuoteItemInput,
    channelId: string | null,
  ): Promise<Prisma.QuoteItemUncheckedCreateWithoutQuoteInput> {
    if (item.type === 'PRODUCT') {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new NotFoundException(`Producto ${item.productId} inexistente`);

      const cost = await this.costing.forProduct(item.productId);
      const { unitPrice, unitProfit } = await this.computeUnitPrice(
        {
          fabricationPrice: cost.fabricationPrice,
          otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
          totalCost: cost.totalCost,
        },
        channelId,
        item.productId,
        item.quantity,
      );
      const lineTotal = unitPrice * item.quantity;

      return {
        productId: item.productId,
        description: item.description ?? product.name,
        quantity: item.quantity,
        unitCost: cost.totalCost,
        unitPrice,
        unitProfit,
        lineTotal,
      };
    }

    // ADHOC
    const cost = await this.costing.forAdhoc({
      description: item.description,
      pieces: item.payload.pieces,
      materials: item.payload.materials,
      assemblyMinutes: item.payload.assemblyMinutes,
      managementMinutes: item.payload.managementMinutes,
    });
    const { unitPrice, unitProfit } = await this.computeUnitPrice(
      {
        fabricationPrice: cost.fabricationPrice,
        otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
        totalCost: cost.totalCost,
      },
      channelId,
      null,
      item.quantity,
    );
    const lineTotal = unitPrice * item.quantity;

    return {
      productId: null,
      description: item.description,
      quantity: item.quantity,
      unitCost: cost.totalCost,
      unitPrice,
      unitProfit,
      lineTotal,
      adhocPayload: item.payload as unknown as Prisma.InputJsonValue,
    };
  }

  private async computeUnitPrice(
    cost: {
      fabricationPrice: number;
      otherMaterialsWithReplenishment: number;
      totalCost: number;
    },
    channelId: string | null,
    productId: string | null,
    quantity: number,
  ): Promise<{ unitPrice: number; unitProfit: number }> {
    if (!channelId) {
      // Sin canal el precio = costo total (caller puede sobreescribir).
      // El profit no se puede calcular sin markup del producto, queda 0.
      return { unitPrice: cost.totalCost, unitProfit: 0 };
    }

    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Canal inexistente');

    const [tier, productChannel, globals, product] = await Promise.all([
      productId ? this.tiers.findApplicable(productId, quantity) : Promise.resolve(null),
      productId
        ? this.prisma.productChannel.findUnique({
            where: { productId_channelId: { productId, channelId } },
          })
        : Promise.resolve(null),
      this.pricing.loadGlobals(),
      productId
        ? this.prisma.product.findUnique({
            where: { id: productId },
            select: { targetMarkupPct: true },
          })
        : Promise.resolve(null),
    ]);

    const cfg = this.pricing.toConfig(channel);
    const productInputs = {
      targetMarkupPct: product ? Number(product.targetMarkupPct) : 0,
      marketplaceCommissionPct:
        productChannel && productChannel.commissionPct ? Number(productChannel.commissionPct) : null,
    };
    const tierOverrides = tier ? { markupPct: tier.markupPct ?? undefined } : {};
    const line = this.engine.price(
      {
        fabricationPrice: cost.fabricationPrice,
        otherMaterialsWithReplenishment: cost.otherMaterialsWithReplenishment,
      },
      cfg,
      productInputs,
      globals,
      tierOverrides,
    );
    return { unitPrice: line.finalPrice, unitProfit: line.profit };
  }

  private async nextCode(type: QuoteType): Promise<string> {
    // Q-YYYY-NNNN for catalog products, R-YYYY-NNNN for instant (Rápida).
    const year = new Date().getFullYear();
    const letter = type === QuoteType.ADHOC ? 'R' : 'Q';
    const prefix = `${letter}-${year}-`;
    const last = await this.prisma.quote.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNum = last ? Number(last.code.slice(prefix.length)) : 0;
    const next = (lastNum + 1).toString().padStart(4, '0');
    return `${prefix}${next}`;
  }

  private isValidTransition(from: QuoteStatus, to: QuoteStatus): boolean {
    const allowed: Record<QuoteStatus, QuoteStatus[]> = {
      DRAFT: [QuoteStatus.SENT, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
      SENT: [QuoteStatus.ACCEPTED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED, QuoteStatus.DRAFT],
      ACCEPTED: [],
      REJECTED: [QuoteStatus.DRAFT],
      EXPIRED: [QuoteStatus.DRAFT],
    };
    return allowed[from]?.includes(to) ?? false;
  }

  private toDto(q: {
    id: string;
    code: string;
    type: QuoteType;
    status: QuoteStatus;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    customerNotes: string | null;
    channelId: string | null;
    channel?: { name: string } | null;
    withInvoice: boolean;
    subtotal: Prisma.Decimal;
    discount: Prisma.Decimal;
    total: Prisma.Decimal;
    validUntil: Date | null;
    notes: string | null;
    createdById: string;
    createdAt: Date;
    items: Array<{
      id: string;
      productId: string | null;
      description: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      unitProfit: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      adhocPayload: Prisma.JsonValue;
    }>;
  }): QuoteDto {
    const items: QuoteItemDto[] = q.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      description: i.description,
      quantity: dec(i.quantity),
      unitCost: dec(i.unitCost),
      unitPrice: dec(i.unitPrice),
      unitProfit: dec(i.unitProfit),
      lineTotal: dec(i.lineTotal),
      adhocPayload:
        i.adhocPayload && typeof i.adhocPayload === 'object'
          ? (i.adhocPayload as unknown as AdhocItemPayload)
          : null,
    }));
    return {
      id: q.id,
      code: q.code,
      type: q.type,
      status: q.status,
      customerName: q.customerName,
      customerEmail: q.customerEmail,
      customerPhone: q.customerPhone,
      customerNotes: q.customerNotes,
      channelId: q.channelId,
      channelName: q.channel?.name ?? null,
      withInvoice: q.withInvoice,
      subtotal: dec(q.subtotal),
      discount: dec(q.discount),
      total: dec(q.total),
      validUntil: q.validUntil,
      notes: q.notes,
      createdById: q.createdById,
      createdAt: q.createdAt,
      itemCount: items.length,
      items,
    };
  }
}
