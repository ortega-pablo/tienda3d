import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuoteStatus, QuoteType } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { CostingService } from '../costing/costing.service';
import {
  CustomersService,
  type CustomerWithRelations,
} from '../customers/customers.service';
import { PricingEngine } from '../pricing/pricing.engine';
import { PricingService } from '../pricing/pricing.service';
import type { CustomerPricingProfile } from '../pricing/pricing.types';
import { ProductTiersService } from '../products/product-tiers.service';
import type {
  AdhocItemPayload,
  QuoteCreateInput,
  QuoteDto,
  QuoteItemDto,
  QuoteItemInput,
  QuoteSummaryDto,
} from './quotes.types';

type CustomerSnapshot = CustomerWithRelations & { capturedAt: string };

type ResolvedCustomerContext = {
  customer: CustomerWithRelations;
  /** Snapshot serializable que se persiste en `Quote.customerProfileSnapshot`. */
  snapshot: CustomerSnapshot;
};

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly pricing: PricingService,
    private readonly engine: PricingEngine,
    private readonly tiers: ProductTiersService,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
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

    // Si vino customerId: cargamos el cliente, validamos catálogo y
    // autocompletamos los datos textuales si el caller no los pasó.
    const customerCtx = input.customerId
      ? await this.resolveCustomerContext(input.customerId, input.items)
      : null;

    const channelId = input.channelId ?? customerCtx?.customer.defaultChannelId ?? null;

    const code = await this.nextCode(quoteType);
    const itemsData = await Promise.all(
      input.items.map((item) => this.buildItemRow(item, channelId, customerCtx)),
    );
    const subtotal = itemsData.reduce((acc, i) => acc + Number(i.lineTotal), 0);
    const discount = input.discount ?? 0;
    const total = Math.max(subtotal - discount, 0);

    // Datos textuales del cliente: si vino customerId, los usamos como fuente
    // de verdad pero el caller puede pisarlos (ej. cliente paga a nombre de
    // un familiar para esta cotización).
    const customerName =
      input.customerName?.trim() || customerCtx?.customer.name || '';
    if (!customerName) {
      throw new BadRequestException('La cotización requiere un nombre de cliente');
    }
    const customerEmail = input.customerEmail ?? customerCtx?.customer.email ?? null;
    const customerPhone = input.customerPhone ?? customerCtx?.customer.phone ?? null;

    const created = await this.prisma.quote.create({
      data: {
        code,
        type: quoteType,
        status: QuoteStatus.DRAFT,
        customerName,
        customerEmail,
        customerPhone,
        customerNotes: input.customerNotes ?? null,
        customerId: input.customerId ?? null,
        customerProfileSnapshot: customerCtx
          ? (customerCtx.snapshot as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        channelId,
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

  /**
   * Carga el cliente + valida que pueda comprar todos los ítems PRODUCT.
   * Construye un snapshot del profile para persistir junto con la cotización.
   */
  private async resolveCustomerContext(
    customerId: string,
    items: QuoteItemInput[],
  ): Promise<ResolvedCustomerContext> {
    const customer = await this.customers.getWithRelations(customerId);
    if (!customer.isActive) {
      throw new BadRequestException('El cliente está desactivado');
    }
    // Validar que todos los productos del catálogo estén permitidos para
    // este cliente. ADHOC se permite siempre (el cliente puede pedir piezas
    // instantáneas sin restricción de categoría).
    const productItems = items.filter((i): i is { type: 'PRODUCT'; productId: string; quantity: number; description?: string } =>
      i.type === 'PRODUCT',
    );
    for (const item of productItems) {
      const ok = await this.customers.canBuy(customerId, item.productId);
      if (!ok) {
        throw new ForbiddenException(
          `El cliente no tiene acceso al producto ${item.productId} (catálogo restringido).`,
        );
      }
    }
    return {
      customer,
      snapshot: { ...customer, capturedAt: new Date().toISOString() },
    };
  }

  async setStatus(id: string, status: QuoteStatus, actorId: string): Promise<QuoteDto> {
    const existing = await this.prisma.quote.findUnique({
      where: { id },
      include: {
        items: {
          select: {
            productId: true,
            quantity: true,
            product: {
              select: { categoryId: true, category: { select: { parentId: true } } },
            },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Cotización inexistente');
    if (!this.isValidTransition(existing.status, status)) {
      throw new BadRequestException(`Transición no válida ${existing.status} → ${status}`);
    }

    const wasAccepted = existing.status === QuoteStatus.ACCEPTED;
    const willBeAccepted = status === QuoteStatus.ACCEPTED;

    await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id }, data: { status } });

      // Tracking del volumen mensual: solo importa cuando hay customerId.
      // Pasamos a ACCEPTED → incrementamos. Salimos de ACCEPTED → decrementamos.
      if (existing.customerId && wasAccepted !== willBeAccepted) {
        const sign = willBeAccepted ? 1 : -1;
        await this.applyMonthlyVolumeDelta(
          tx,
          existing.customerId,
          existing.items,
          existing.createdAt,
          sign,
        );
      }
    });

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

  /**
   * Imputa (o revierte) las cantidades de los items PRODUCT al
   * `CustomerMonthlyVolume` del mes en que se creó la cotización.
   *
   * Imputación por categoría:
   *  - Si el cliente tiene asociada la categoría exacta del producto (o la
   *    subcategoría), imputa a esa.
   *  - Si solo tiene la padre asociada, imputa a la padre.
   *  - Si no tiene ninguna que matchee, no imputa (puede ser SPECIAL o
   *    CONSIGNMENT con catálogo abierto sin commitments).
   */
  private async applyMonthlyVolumeDelta(
    tx: Prisma.TransactionClient,
    customerId: string,
    items: Array<{
      productId: string | null;
      quantity: Prisma.Decimal;
      product: { categoryId: string | null; category: { parentId: string | null } | null } | null;
    }>,
    referenceDate: Date,
    sign: 1 | -1,
  ): Promise<void> {
    const monthStart = startOfMonthUtc(referenceDate);
    const commitments = await tx.customerCategoryCommitment.findMany({
      where: { customerId },
      select: { categoryId: true, monthlyCommitmentQty: true },
    });
    if (commitments.length === 0) return;

    const associatedIds = new Set(commitments.map((c) => c.categoryId));
    const commitmentsByCategory = new Map(
      commitments.map((c) => [c.categoryId, c]),
    );

    // Acumulamos por categoría destino.
    const deltaByCategory = new Map<string, number>();
    for (const item of items) {
      if (!item.productId || !item.product?.categoryId) continue;
      const directCat = item.product.categoryId;
      const parentCat = item.product.category?.parentId ?? null;
      let target: string | null = null;
      if (associatedIds.has(directCat)) target = directCat;
      else if (parentCat && associatedIds.has(parentCat)) target = parentCat;
      if (!target) continue;
      const qty = Number(item.quantity) * sign;
      deltaByCategory.set(target, (deltaByCategory.get(target) ?? 0) + qty);
    }

    for (const [categoryId, delta] of deltaByCategory) {
      const commitment = commitmentsByCategory.get(categoryId);
      const committedQty = commitment?.monthlyCommitmentQty ?? null;
      const existing = await tx.customerMonthlyVolume.findUnique({
        where: {
          customerId_categoryId_monthStart: { customerId, categoryId, monthStart },
        },
      });
      if (existing) {
        const next = Math.max(0, Number(existing.unitsSold) + delta);
        await tx.customerMonthlyVolume.update({
          where: { id: existing.id },
          data: { unitsSold: next, committedQty },
        });
      } else if (delta > 0) {
        await tx.customerMonthlyVolume.create({
          data: {
            customerId,
            categoryId,
            monthStart,
            unitsSold: delta,
            committedQty,
            unfulfilled: false,
          },
        });
      }
      // Si delta < 0 y no hay row, lo ignoramos (no había nada que descontar).
    }
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
    customerId: string | null = null,
  ): Promise<{
    unitCost: number;
    unitPrice: number;
    unitProfit: number;
    lineTotal: number;
    warnings: string[];
  }> {
    const customerCtx = customerId
      ? await this.resolveCustomerContext(customerId, [item])
      : null;
    const effectiveChannel = channelId ?? customerCtx?.customer.defaultChannelId ?? null;
    const row = await this.buildItemRow(item, effectiveChannel, customerCtx);
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
    customerCtx: ResolvedCustomerContext | null,
  ): Promise<Prisma.QuoteItemUncheckedCreateWithoutQuoteInput> {
    if (item.type === 'PRODUCT') {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new NotFoundException(`Producto ${item.productId} inexistente`);

      const cost = await this.costing.forProduct(item.productId);

      // Si hay cliente, resolvemos su profile para este producto
      // (puede tener custom markup, tier piso por categoría, etc.).
      const profile = customerCtx
        ? await this.customers.resolveProductProfile(customerCtx.customer.id, item.productId)
        : null;

      // Recombinamos los componentes del costo si el profile pide
      // skipMarketing/skipReinvestment (afecta fabricationPrice).
      const adjustedCost = profile
        ? this.pricing.applyCustomerCostAdjustments(cost, profile)
        : {
            fabricationPrice: cost.fabricationPrice,
            otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
          };

      const { unitPrice, unitProfit } = await this.computeUnitPrice(
        {
          fabricationPrice: adjustedCost.fabricationPrice,
          otherMaterialsWithReplenishment: adjustedCost.otherMaterialsWithReplenishment,
          totalCost: adjustedCost.fabricationPrice + adjustedCost.otherMaterialsWithReplenishment,
        },
        channelId,
        item.productId,
        item.quantity,
        profile,
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
    // Para ADHOC el cliente no tiene categoría que matchear, así que solo
    // aplican los flags globales (skipMarketing/skipChannelCommission/etc.).
    // No hay tier piso ni custom markup por producto.
    const profile: CustomerPricingProfile | null = customerCtx
      ? {
          skipChannelCommission: customerCtx.customer.skipChannelCommission,
          skipMarketing: customerCtx.customer.skipMarketing,
          skipRegime: customerCtx.customer.skipRegime,
          skipReinvestment: customerCtx.customer.skipReinvestment,
        }
      : null;
    const adjustedCost = customerCtx
      ? this.pricing.applyCustomerCostAdjustments(cost, {
          skipMarketing: customerCtx.customer.skipMarketing,
          skipReinvestment: customerCtx.customer.skipReinvestment,
        })
      : {
          fabricationPrice: cost.fabricationPrice,
          otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
        };
    const { unitPrice, unitProfit } = await this.computeUnitPrice(
      {
        fabricationPrice: adjustedCost.fabricationPrice,
        otherMaterialsWithReplenishment: adjustedCost.otherMaterialsWithReplenishment,
        totalCost: adjustedCost.fabricationPrice + adjustedCost.otherMaterialsWithReplenishment,
      },
      channelId,
      null,
      item.quantity,
      profile,
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
    customerProfile: CustomerPricingProfile | null = null,
  ): Promise<{ unitPrice: number; unitProfit: number }> {
    if (!channelId) {
      // Sin canal el precio = costo total (caller puede sobreescribir).
      // El profit no se puede calcular sin markup del producto, queda 0.
      return { unitPrice: cost.totalCost, unitProfit: 0 };
    }

    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Canal inexistente');

    // Tier piso del cliente: si está definido, resolvemos la tier que aplica
    // como si la cantidad fuera al menos `minTierQty`.
    const effectiveQty =
      customerProfile?.minTierQty != null
        ? Math.max(quantity, customerProfile.minTierQty)
        : quantity;

    const [tier, productChannel, globals, product] = await Promise.all([
      productId ? this.tiers.findApplicable(productId, effectiveQty) : Promise.resolve(null),
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
      customerProfile ?? {},
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
    customerId: string | null;
    customerProfileSnapshot: Prisma.JsonValue;
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
      customerId: q.customerId,
      customerProfileSnapshot:
        q.customerProfileSnapshot && typeof q.customerProfileSnapshot === 'object'
          ? (q.customerProfileSnapshot as Record<string, unknown>)
          : null,
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

/** Devuelve el primer día del mes (UTC) de la fecha dada. */
function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}
