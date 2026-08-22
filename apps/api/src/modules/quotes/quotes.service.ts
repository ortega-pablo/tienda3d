import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PieceScope, Prisma, QuoteStatus, QuoteType } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { addBusinessDays, startOfBusinessMonth } from '@/common/utils/date';
import { DocumentCodeService } from '@/common/utils/document-code';
import { CostingService } from '../costing/costing.service';
import type { CostingResult } from '../costing/costing.types';
import {
  CustomersService,
  type CustomerWithRelations,
} from '../customers/customers.service';
import { KeychainScaleTiersService } from '../keychain-scale-tiers/keychain-scale-tiers.service';
import { PricingEngine } from '../pricing/pricing.engine';
import { PricingService } from '../pricing/pricing.service';
import { roundPriceUp } from '../pricing/round-price';
import type { CustomerPricingProfile, PriceLine } from '../pricing/pricing.types';
import { CategoryTiersService } from '../categories/category-tiers.service';
import type {
  AdhocItemPayload,
  QuoteCreateInput,
  QuoteDto,
  QuoteItemDto,
  QuoteItemInput,
  QuoteItemPricingBreakdown,
  QuoteItemPricingContext,
  QuoteSummaryDto,
} from './quotes.types';

type CustomerSnapshot = CustomerWithRelations & { capturedAt: string };

/**
 * Resultado de `buildItemRow`: la fila a persistir más las piezas del cálculo
 * que la produjeron, para que el preview pueda mostrar advertencias sin
 * recalcular nada.
 */
type BuiltItemRow = {
  row: Prisma.QuoteItemUncheckedCreateWithoutQuoteInput;
  cost: CostingResult;
  line: PriceLine | null;
};

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
    private readonly categoryTiers: CategoryTiersService,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
    private readonly keychainScaleTiers: KeychainScaleTiersService,
    private readonly codes: DocumentCodeService,
  ) {}

  async list(
    filters: { type?: QuoteType; templateKind?: 'KEYCHAIN' } = {},
  ): Promise<QuoteSummaryDto[]> {
    // Filtro por templateKind: como vive dentro del JSON `adhocPayload`,
    // usamos Prisma JSON path. Si pidieron keychain, forzamos type=ADHOC
    // y buscamos items con `templateKind: 'KEYCHAIN'` en el payload.
    const where: Prisma.QuoteWhereInput = {};
    if (filters.type) where.type = filters.type;
    if (filters.templateKind === 'KEYCHAIN') {
      where.type = QuoteType.ADHOC;
      where.items = {
        some: {
          adhocPayload: {
            path: ['templateKind'],
            equals: 'KEYCHAIN',
          },
        },
      };
    }

    const quotes = await this.prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        // Necesitamos `adhocPayload` para derivar `templateKind` en el DTO.
        items: { select: { id: true, adhocPayload: true } },
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
      templateKind: q.items.some(
        (i) =>
          i.adhocPayload &&
          typeof i.adhocPayload === 'object' &&
          !Array.isArray(i.adhocPayload) &&
          (i.adhocPayload as { templateKind?: unknown }).templateKind === 'KEYCHAIN',
      )
        ? 'KEYCHAIN'
        : null,
    }));
  }

  async get(id: string, includeBreakdown = false): Promise<QuoteDto> {
    const q = await this.prisma.quote.findUnique({
      where: { id },
      include: { items: true, channel: { select: { name: true } } },
    });
    if (!q) throw new NotFoundException('Cotización inexistente');
    return this.toDto(q, includeBreakdown);
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

    // Fase 5/6 reemplazarán este fallback por el del checkbox "sin factura":
    // por ahora el caller (form web) sigue mandando channelId. Si no manda,
    // queda null y el motor usa cost = price (caso "sin canal").
    const channelId = input.channelId ?? null;

    const code = await this.nextCode(quoteType);
    const built = await Promise.all(
      input.items.map((item) => this.buildItemRow(item, channelId, customerCtx)),
    );
    const itemsData = built.map((b) => b.row);
    // Cada lineTotal ya es múltiplo del paso (unitPrice y designSurcharge vienen
    // redondeados del motor), así que el subtotal también lo es. El descuento
    // puede romper el múltiplo, por eso el total se redondea hacia arriba tras
    // restarlo. loadGlobals trae el paso (0 = sin redondeo).
    const { roundingStep } = await this.pricing.loadGlobals();
    const subtotal = itemsData.reduce((acc, i) => acc + Number(i.lineTotal), 0);
    const discount = input.discount ?? 0;
    const total = roundPriceUp(Math.max(subtotal - discount, 0), roundingStep);

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
        // Validez del documento: 15 días hábiles (lun-vie) desde la emisión.
        // Es una regla fija del negocio — si el caller manda validUntil se
        // respeta, si no se computa el default.
        validUntil: input.validUntil ? new Date(input.validUntil) : addBusinessDays(new Date(), 15),
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
      // Update condicional sobre el estado leído: la validación de transición
      // lee antes de escribir, así que sin esto dos requests concurrentes
      // pasarían ambos y la imputación de volumen —que es acumulativa— se
      // aplicaría dos veces. Si otro request ya movió la cotización, afecta 0
      // filas y abortamos.
      const claimed = await tx.quote.updateMany({
        where: { id, status: existing.status },
        data: { status },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'La cotización cambió de estado mientras se procesaba. Recargá la página.',
        );
      }

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
    const monthStart = startOfBusinessMonth(referenceDate);
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

  async remove(id: string, actorId: string): Promise<void> {
    const q = await this.prisma.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Cotización inexistente');
    if (q.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('Solo se pueden eliminar cotizaciones en borrador');
    }
    await this.prisma.quote.delete({ where: { id } });
    // El borrado es la única mutación de cotización que no dejaba rastro.
    await this.audit.record({
      actorId,
      entity: 'Quote',
      entityId: id,
      action: 'delete',
      before: { code: q.code, status: q.status, total: dec(q.total) },
      after: null,
    });
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
    /** Cargo de diseño grossed-up para mostrar separado del unitPrice × qty. */
    designSurcharge: number;
    warnings: string[];
  }> {
    const customerCtx = customerId
      ? await this.resolveCustomerContext(customerId, [item])
      : null;
    // El cliente ya no lleva canal default — el form siempre manda channelId.
    const effectiveChannel = channelId ?? null;
    const { row, cost, line } = await this.buildItemRow(item, effectiveChannel, customerCtx);
    const designSurcharge =
      row.adhocPayload &&
      typeof row.adhocPayload === 'object' &&
      'designSurcharge' in row.adhocPayload &&
      typeof (row.adhocPayload as { designSurcharge?: unknown }).designSurcharge === 'number'
        ? (row.adhocPayload as { designSurcharge: number }).designSurcharge
        : 0;
    return {
      unitCost: Number(row.unitCost),
      unitPrice: Number(row.unitPrice),
      unitProfit: Number(row.unitProfit ?? 0),
      lineTotal: Number(row.lineTotal),
      designSurcharge,
      warnings: collectWarnings(cost, line),
    };
  }

  /**
   * Devuelve precio por unidad y total para cada escala de llaveros, con el
   * mismo payload. Se itera la grilla contigua `KeychainScaleTier` con un qty
   * representativo por escala (el minQty); el caller pinta la fila y el cliente
   * decide en qué escala cotizar.
   *
   * Compartimos `buildItemRow` para no duplicar costing/comisión/régimen:
   * cada fila se calcula como si fuese una cotización ADHOC con esa qty,
   * solo que NO se persiste (descartamos el resultado luego de leer los
   * campos relevantes).
   */
  async keychainMatrix(input: {
    channelId: string;
    customerId?: string | null;
    payload: {
      pieces: Array<{ name: string; grams: number; printMinutes: number; filamentId: string }>;
      individualPieces?: Array<{
        name: string;
        grams: number;
        printMinutes: number;
        filamentId: string;
      }>;
      materials: Array<{ materialId: string; quantity: number }>;
      assemblyMinutes: number;
      managementMinutes: number;
      designMinutes?: number;
    };
  }): Promise<{
    tiers: Array<{
      tierId: string;
      tierLabel: string;
      minQty: number;
      maxQty: number | null;
      markupPct: number;
      unitPrice: number;
      unitProfit: number;
      lineTotal: number;
      designSurcharge: number;
      warnings: string[];
    }>;
  }> {
    const tiers = await this.keychainScaleTiers.list();
    if (tiers.length === 0) {
      return { tiers: [] };
    }

    const customerCtx = input.customerId
      ? await this.resolveCustomerContext(input.customerId, [])
      : null;

    const rows = await Promise.all(
      tiers.map(async (tier) => {
        // Usamos el minQty como cantidad representativa de la escala.
        const item = {
          type: 'ADHOC' as const,
          description: 'Llavero personalizado',
          quantity: tier.minQty,
          payload: {
            ...input.payload,
            templateKind: 'KEYCHAIN' as const,
          },
        };
        const { row, cost, line } = await this.buildItemRow(item, input.channelId, customerCtx);
        const adhocPayload = row.adhocPayload as
          | { designSurcharge?: number; appliedMarkupPct?: number }
          | null;
        const designSurcharge =
          adhocPayload && typeof adhocPayload.designSurcharge === 'number'
            ? adhocPayload.designSurcharge
            : 0;
        return {
          tierId: tier.id,
          tierLabel: KeychainScaleTiersService.tierLabel(tier),
          minQty: tier.minQty,
          maxQty: tier.maxQty,
          markupPct: tier.markupPct,
          unitPrice: Number(row.unitPrice),
          unitProfit: Number(row.unitProfit ?? 0),
          lineTotal: Number(row.lineTotal),
          designSurcharge,
          warnings: collectWarnings(cost, line),
        };
      }),
    );
    return { tiers: rows };
  }

  // ----- internals -----

  /**
   * Construye la fila de ítem lista para persistir y devuelve, aparte, el
   * desglose que la produjo. El desglose se necesita en el preview: hasta ahora
   * `previewItem` devolvía `warnings: []` literal y las advertencias del motor
   * (filamento sin precio vigente, comisión de marketplace faltante, comisión +
   * impuestos ≥ 100%) se descartaban justo en la pantalla donde el vendedor
   * arma la cotización.
   */
  private async buildItemRow(
    item: QuoteItemInput,
    channelId: string | null,
    customerCtx: ResolvedCustomerContext | null,
  ): Promise<BuiltItemRow> {
    if (item.type === 'PRODUCT') {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new NotFoundException(`Producto ${item.productId} inexistente`);

      // Producto tipo llavero: la base de costo y el markup dependen de la
      // cantidad. Para 1-4 se usa la base de piezas INDIVIDUAL; para 5+ la
      // base de tanda ÷ keychain_batch_size. El markup viene de la grilla
      // global de escalas (pisa el target del motor vía override).
      const isKeychain = product.kind === 'KEYCHAIN';
      let keychainMarkupOverride: number | null = null;
      let keychainCtx: Partial<QuoteItemPricingContext> = {};
      let cost: CostingResult;
      if (isKeychain) {
        const scaleTiers = await this.keychainScaleTiers.list();
        const scaleTier = KeychainScaleTiersService.resolveApplicable(scaleTiers, item.quantity);
        if (!scaleTier) {
          throw new BadRequestException(
            `Sin escala de llavero para la cantidad ${item.quantity}. Revisá la grilla en /parametros.`,
          );
        }
        keychainMarkupOverride = scaleTier.markupPct;
        const scope = KeychainScaleTiersService.resolveScope(scaleTiers, item.quantity);
        const batchSize =
          scope === PieceScope.BATCH ? await this.loadKeychainBatchSize() : undefined;
        const costingOpts =
          scope === PieceScope.INDIVIDUAL
            ? { pieceScope: PieceScope.INDIVIDUAL }
            : { pieceScope: PieceScope.BATCH, divideBy: batchSize! };
        cost = await this.costing.forProduct(item.productId, costingOpts);
        keychainCtx = {
          pricingBase: scope,
          scaleLabel: KeychainScaleTiersService.tierLabel(scaleTier),
          scaleMarkupPct: scaleTier.markupPct,
          ...(batchSize ? { batchSize } : {}),
        };
      } else {
        cost = await this.costing.forProduct(item.productId);
      }

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

      const { unitPrice, unitProfit, line, roundingStep } = await this.computeUnitPrice(
        {
          fabricationPrice: adjustedCost.fabricationPrice,
          otherMaterialsWithReplenishment: adjustedCost.otherMaterialsWithReplenishment,
          totalCost: adjustedCost.fabricationPrice + adjustedCost.otherMaterialsWithReplenishment,
        },
        channelId,
        item.productId,
        item.quantity,
        profile,
        0,
        keychainMarkupOverride,
      );
      const lineTotal = unitPrice * item.quantity;

      const breakdown: QuoteItemPricingBreakdown = {
        cost,
        price: line,
        context: {
          ...keychainCtx,
          customerAdjusted: adjustedCost.fabricationPrice !== cost.fabricationPrice,
          fabricationPriceUsed: adjustedCost.fabricationPrice,
          roundingStep,
        },
      };

      return {
        row: {
          productId: item.productId,
          description: item.description ?? product.name,
          quantity: item.quantity,
          // Costo AJUSTADO, la misma base sobre la que se calculó el precio.
          // Antes se persistía `cost.totalCost` (sin ajustar) mientras el precio
          // salía de `adjustedCost`: para clientes con skipMarketing o
          // skipReinvestment los dos números quedaban sobre bases distintas y
          // cualquier margen derivado de la cotización guardada salía inflado.
          unitCost: adjustedCost.fabricationPrice + adjustedCost.otherMaterialsWithReplenishment,
          unitPrice,
          unitProfit,
          lineTotal,
          pricingBreakdown: breakdown as unknown as Prisma.InputJsonValue,
        },
        cost,
        line,
      };
    }

    // ADHOC
    const isKeychain = item.payload.templateKind === 'KEYCHAIN';
    if (isKeychain && (!Number.isInteger(item.quantity) || item.quantity < 1)) {
      throw new BadRequestException('La cantidad de llaveros debe ser un entero ≥ 1');
    }

    const [designHourCostParam, batchSizeParam, scaleTiers] = await Promise.all([
      this.prisma.globalParam.findUnique({ where: { key: 'design_hour_cost' } }),
      isKeychain
        ? this.prisma.globalParam.findUnique({ where: { key: 'keychain_batch_size' } })
        : Promise.resolve(null),
      isKeychain ? this.keychainScaleTiers.list() : Promise.resolve([]),
    ]);

    const batchSize = isKeychain
      ? batchSizeParam
        ? Math.max(1, Math.floor(Number(batchSizeParam.value)))
        : 5
      : 1;

    // Modelo de llaveros: la escala (grilla contigua) y la base dependen de la
    // cantidad. 1-4 usa `individualPieces` (piezas para 1 unidad); 5+ usa la
    // tanda (`pieces`) ÷ batchSize. Insumos y adicionales NO se dividen: son
    // por unidad. `designMinutes` es cargo plano aparte.
    let keychainScale: { markupPct: number; minQty: number; maxQty: number | null } | null =
      null;
    let pricingBase: 'INDIVIDUAL' | 'BATCH' | null = null;
    let costingPieces = item.payload.pieces;
    if (isKeychain) {
      keychainScale = KeychainScaleTiersService.resolveApplicable(scaleTiers, item.quantity);
      if (!keychainScale) {
        throw new BadRequestException(
          `Sin escala de llavero para la cantidad ${item.quantity}. Revisá la grilla en /parametros.`,
        );
      }
      pricingBase = KeychainScaleTiersService.resolveScope(scaleTiers, item.quantity);
      const dividePieces = (pcs: typeof item.payload.pieces) =>
        pcs.map((p) => ({
          ...p,
          grams: p.grams / batchSize,
          printMinutes: p.printMinutes / batchSize,
        }));
      if (pricingBase === PieceScope.INDIVIDUAL) {
        // Base individual: usamos `individualPieces` si el vendedor las cargó;
        // si no, caemos a la tanda ÷ batchSize (fallback).
        costingPieces =
          item.payload.individualPieces && item.payload.individualPieces.length > 0
            ? item.payload.individualPieces
            : dividePieces(item.payload.pieces);
      } else {
        costingPieces = dividePieces(item.payload.pieces);
      }
    }

    const cost = await this.costing.forAdhoc({
      description: item.description,
      pieces: costingPieces,
      materials: item.payload.materials,
      assemblyMinutes: item.payload.assemblyMinutes,
      managementMinutes: item.payload.managementMinutes,
    });
    const designMinutes = item.payload.designMinutes ?? 0;
    const designHourCost = designHourCostParam ? Number(designHourCostParam.value) : 0;
    const designRaw = (designMinutes / 60) * designHourCost;
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
    const { unitPrice, unitProfit, designSurcharge, line, roundingStep } =
      await this.computeUnitPrice(
        {
          fabricationPrice: adjustedCost.fabricationPrice,
          otherMaterialsWithReplenishment: adjustedCost.otherMaterialsWithReplenishment,
          totalCost: adjustedCost.fabricationPrice + adjustedCost.otherMaterialsWithReplenishment,
        },
        channelId,
        null,
        item.quantity,
        profile,
        designRaw,
        keychainScale ? keychainScale.markupPct : null,
      );
    // El cargo de diseño es plano por línea (no escala con la cantidad)
    // pero forma parte del lineTotal para que paye comisión + régimen
    // y se incluya en el subtotal / descuento de la cotización.
    const lineTotal = unitPrice * item.quantity + designSurcharge;

    // Snapshot de nombres de filamento e insumo para que el PDF y el
    // detalle puedan listar los componentes del item sin tener que
    // resolver los ids en runtime. Si un material se borra después,
    // el snapshot histórico sigue mostrando el nombre que el cliente vio.
    const allIds = new Set<string>();
    for (const p of item.payload.pieces) if (p.filamentId) allIds.add(p.filamentId);
    for (const p of item.payload.individualPieces ?? []) if (p.filamentId) allIds.add(p.filamentId);
    for (const m of item.payload.materials) if (m.materialId) allIds.add(m.materialId);
    const nameLookup = new Map<string, string>();
    if (allIds.size > 0) {
      const materials = await this.prisma.material.findMany({
        where: { id: { in: [...allIds] } },
        select: { id: true, name: true },
      });
      for (const m of materials) nameLookup.set(m.id, m.name);
    }

    // Persistimos designMinutes + designSurcharge en el payload JSON: así el
    // PDF muestra el desglose exacto que se firmó aunque el global param cambie
    // después. Para keychain también snapshoteamos el markup aplicado, el label
    // de la escala ("5-24", "100+"), el batchSize y la base usada. El payload
    // se guarda SIN DIVIDIR — la división por tanda existe solo en el costeo.
    const persistedPayload: AdhocItemPayload = {
      ...item.payload,
      pieces: item.payload.pieces.map((p) => ({
        ...p,
        filamentName: nameLookup.get(p.filamentId),
      })),
      ...(item.payload.individualPieces
        ? {
            individualPieces: item.payload.individualPieces.map((p) => ({
              ...p,
              filamentName: nameLookup.get(p.filamentId),
            })),
          }
        : {}),
      materials: item.payload.materials.map((m) => ({
        ...m,
        materialName: nameLookup.get(m.materialId),
      })),
      designMinutes,
      designSurcharge,
      ...(keychainScale
        ? {
            templateKind: 'KEYCHAIN' as const,
            appliedMarkupPct: keychainScale.markupPct,
            tierLabel: KeychainScaleTiersService.tierLabel(keychainScale),
            batchSize,
            ...(pricingBase ? { pricingBase } : {}),
          }
        : {}),
    };

    const breakdown: QuoteItemPricingBreakdown = {
      cost,
      price: line,
      context: {
        ...(keychainScale
          ? {
              pricingBase: pricingBase ?? undefined,
              scaleLabel: KeychainScaleTiersService.tierLabel(keychainScale),
              scaleMarkupPct: keychainScale.markupPct,
              ...(pricingBase === 'BATCH' ? { batchSize } : {}),
            }
          : {}),
        ...(designRaw > 0 ? { designRaw, designSurcharge } : {}),
        customerAdjusted: adjustedCost.fabricationPrice !== cost.fabricationPrice,
        fabricationPriceUsed: adjustedCost.fabricationPrice,
        roundingStep,
      },
    };

    return {
      row: {
        productId: null,
        description: item.description,
        quantity: item.quantity,
        // Ver comentario en la rama PRODUCT: mismo criterio.
        unitCost: adjustedCost.fabricationPrice + adjustedCost.otherMaterialsWithReplenishment,
        unitPrice,
        unitProfit,
        lineTotal,
        adhocPayload: persistedPayload as unknown as Prisma.InputJsonValue,
        pricingBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      },
      cost,
      line,
    };
  }

  /** Lee `keychain_batch_size` (default 5). Tamaño de la placa de llaveros. */
  private async loadKeychainBatchSize(): Promise<number> {
    const param = await this.prisma.globalParam.findUnique({
      where: { key: 'keychain_batch_size' },
    });
    return param ? Math.max(1, Math.floor(Number(param.value))) : 5;
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
    designRawAmount = 0,
    /** Override explícito de markup (p.ej. tier de llaveros). Pisa el target. */
    markupOverridePct: number | null = null,
  ): Promise<{
    unitPrice: number;
    unitProfit: number;
    designSurcharge: number;
    /** PriceLine del motor (para el snapshot de desglose). null sin canal. */
    line: PriceLine | null;
    /** Paso de redondeo aplicado (0 sin canal / sin redondeo). */
    roundingStep: number;
  }> {
    if (!channelId) {
      // Sin canal el precio = costo total (caller puede sobreescribir).
      // El profit no se puede calcular sin markup del producto, queda 0.
      // El surcharge tampoco aplica sin canal: se devuelve crudo (sin gross-up).
      return {
        unitPrice: cost.totalCost,
        unitProfit: 0,
        designSurcharge: designRawAmount,
        line: null,
        roundingStep: 0,
      };
    }

    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Canal inexistente');

    // Tier piso del cliente: si está definido, resolvemos la tier que aplica
    // como si la cantidad fuera al menos `minTierQty`.
    const effectiveQty =
      customerProfile?.minTierQty != null
        ? Math.max(quantity, customerProfile.minTierQty)
        : quantity;

    // Para resolver tiers del producto: leemos su categoryId y le pedimos a
    // CategoryTiersService la tier que cubre la qty (con herencia padre).
    const product = productId
      ? await this.prisma.product.findUnique({
          where: { id: productId },
          select: { categoryId: true },
        })
      : null;

    // Para ADHOC libre (sin producto ni override) cargamos el markup default
    // de cotización a medida del global param. Sin esto el motor usaría 0%
    // y se vendería al costo.
    const needsAdhocDefault = !product && markupOverridePct == null;
    const [tier, productChannel, globals, baseMarkup, adhocDefaultParam] = await Promise.all([
      product
        ? this.categoryTiers.findApplicable(product.categoryId, channelId, effectiveQty)
        : Promise.resolve(null),
      productId
        ? this.prisma.productChannel.findUnique({
            where: { productId_channelId: { productId, channelId } },
          })
        : Promise.resolve(null),
      this.pricing.loadGlobals(),
      product
        ? this.pricing.resolveBaseMarkup(product.categoryId).catch(() => 0)
        : Promise.resolve(0),
      needsAdhocDefault
        ? this.prisma.globalParam.findUnique({ where: { key: 'adhoc_default_markup_pct' } })
        : Promise.resolve(null),
    ]);

    const adhocDefaultMarkup = needsAdhocDefault
      ? adhocDefaultParam
        ? Math.max(0, Number(adhocDefaultParam.value))
        : 60
      : 0;

    const cfg = this.pricing.toConfig(channel);
    const productInputs = {
      // Resolución del markup que ve el motor:
      //   - Con producto: baseMarkup de la categoría (con fallback al padre).
      //     Si hay tier que cubra qty, lo pisa vía tierOverrides abajo.
      //   - Sin producto, sin override de keychain: adhocDefaultMarkup del
      //     global param (default 60%).
      //   - customMarkupPct del cliente pisa todo internamente en el motor.
      targetMarkupPct: product ? baseMarkup : adhocDefaultMarkup,
      marketplaceCommissionPct:
        productChannel && productChannel.commissionPct ? Number(productChannel.commissionPct) : null,
    };
    // Precedencia: markupOverridePct (caller, p.ej. tier de llaveros)
    //   > tier resuelta de la categoría del producto > baseMarkup del target.
    const tierOverrides =
      markupOverridePct != null
        ? { markupPct: markupOverridePct }
        : tier
          ? { markupPct: tier.markupPct }
          : {};
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
    const designSurcharge = this.engine.surcharge(
      designRawAmount,
      cfg,
      globals,
      customerProfile ?? {},
    );
    return {
      unitPrice: line.finalPrice,
      unitProfit: line.profit,
      designSurcharge,
      line,
      roundingStep: globals.roundingStep ?? 0,
    };
  }

  /**
   * Q-YYYY-NNNN para productos de catálogo, R-YYYY-NNNN para instantáneas
   * (Rápida). Reservado atómicamente — ver DocumentCodeService.
   */
  private nextCode(type: QuoteType): Promise<string> {
    const letter = type === QuoteType.ADHOC ? 'R' : 'Q';
    return this.codes.next('QUOTE', letter);
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
      pricingBreakdown?: Prisma.JsonValue;
    }>;
  }, includeBreakdown = false): QuoteDto {
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
      // Solo se expone a usuarios con permiso (gate en el controller).
      pricingBreakdown:
        includeBreakdown && i.pricingBreakdown && typeof i.pricingBreakdown === 'object'
          ? (i.pricingBreakdown as unknown as QuoteItemPricingBreakdown)
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
      templateKind: items.some((i) => i.adhocPayload?.templateKind === 'KEYCHAIN')
        ? 'KEYCHAIN'
        : null,
      items,
    };
  }
}

/**
 * Une las advertencias del costeo y las del motor de precios, sin duplicados.
 * Son los avisos que el vendedor necesita ver junto al número: filamento sin
 * precio vigente (se costea en 0), comisión de marketplace sin cargar, o
 * comisión + impuestos ≥ 100%.
 */
function collectWarnings(cost: CostingResult, line: PriceLine | null): string[] {
  return [...new Set([...cost.warnings, ...(line?.warnings ?? [])])];
}
