import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductionStatus, StockMovementType } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { DocumentCodeService } from '@/common/utils/document-code';
import { CostingService } from '../costing/costing.service';

export interface ProductionConsumptionLine {
  materialId: string;
  materialName: string;
  unit: string;
  recipeQty: number;
  wastePct: number;
  totalQty: number;
}

export interface ProductionDto {
  id: string;
  code: string;
  productId: string;
  productName: string;
  quantity: number;
  status: ProductionStatus;
  totalCostSnapshot: number;
  filamentOverrides: Record<string, string> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  notes: string | null;
  createdById: string;
  createdAt: Date;
}

export interface ProductionDetailDto extends ProductionDto {
  consumption: ProductionConsumptionLine[];
}

@Injectable()
export class ProductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly audit: AuditService,
    private readonly codes: DocumentCodeService,
  ) {}

  async list(): Promise<ProductionDto[]> {
    const orders = await this.prisma.productionOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true } } },
    });
    return orders.map((o) => this.toDto(o));
  }

  async get(id: string): Promise<ProductionDetailDto> {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: { product: { select: { name: true } } },
    });
    if (!order) throw new NotFoundException('Orden inexistente');

    const consumption = await this.previewConsumption(order.productId, dec(order.quantity), {
      filamentOverrides: this.parseOverrides(order.filamentOverrides),
    });
    return { ...this.toDto(order), consumption };
  }

  async create(input: {
    productId: string;
    quantity: number;
    filamentOverrides?: Record<string, string>;
    notes?: string | null;
  }, actorId: string): Promise<ProductionDetailDto> {
    if (input.quantity <= 0) throw new BadRequestException('La cantidad debe ser mayor a 0');

    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      include: { pieces: true },
    });
    if (!product) throw new NotFoundException('Producto inexistente');

    // Validate per-piece color picks against the parent/child hierarchy.
    // Pieces whose default points to a filament parent MUST have an override
    // pointing to one of its children (the actual color we consume).
    await this.validateFilamentOverrides(product.pieces, input.filamentOverrides);

    const cost = await this.costing.forProduct(input.productId);
    const code = await this.nextCode();

    const created = await this.prisma.productionOrder.create({
      data: {
        code,
        productId: input.productId,
        quantity: input.quantity,
        status: ProductionStatus.PLANNED,
        totalCostSnapshot: cost.costWithProvisions * input.quantity,
        filamentOverrides: input.filamentOverrides
          ? (input.filamentOverrides as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        notes: input.notes ?? null,
        createdById: actorId,
      },
      include: { product: { select: { name: true } } },
    });
    return this.get(created.id);
  }

  private async validateFilamentOverrides(
    pieces: Array<{ id: string; name: string; defaultFilamentId: string | null }>,
    overrides: Record<string, string> | undefined,
  ): Promise<void> {
    const piecesWithDefault = pieces.filter((p) => p.defaultFilamentId);
    if (piecesWithDefault.length === 0) return;

    const defaultIds = [...new Set(piecesWithDefault.map((p) => p.defaultFilamentId!).values())];
    const defaults = await this.prisma.material.findMany({
      where: { id: { in: defaultIds } },
      include: { children: { select: { id: true, isActive: true } } },
    });
    const defaultsById = new Map(defaults.map((d) => [d.id, d]));

    for (const piece of piecesWithDefault) {
      const def = defaultsById.get(piece.defaultFilamentId!);
      if (!def) {
        throw new BadRequestException(
          `Filamento default de la pieza "${piece.name}" inexistente.`,
        );
      }
      const isParent = def.children.length > 0;
      if (!isParent) continue; // Legacy / non-hierarchical filament — no color choice needed.

      const chosen = overrides?.[piece.id];
      if (!chosen) {
        throw new BadRequestException(
          `Falta elegir el color de filamento para la pieza "${piece.name}".`,
        );
      }
      const validChild = def.children.find((c) => c.id === chosen);
      if (!validChild) {
        throw new BadRequestException(
          `El color elegido para la pieza "${piece.name}" no pertenece al filamento ${def.name}.`,
        );
      }
      if (!validChild.isActive) {
        throw new BadRequestException(
          `El color elegido para la pieza "${piece.name}" está inactivo.`,
        );
      }
    }
  }

  /**
   * Cambia el estado de la orden y, si pasa a DONE, descuenta el stock.
   *
   * Ambas cosas ocurren en UNA transacción con un update condicional sobre el
   * estado leído. Antes el descuento corría en su propia transacción y el
   * cambio de estado quedaba afuera, lo que abría dos agujeros:
   *   - si el update fallaba después del descuento, el stock quedaba consumido
   *     con la orden todavía en IN_PROGRESS, y el reintento descontaba de nuevo;
   *   - dos requests concurrentes a DONE pasaban ambos la validación de
   *     transición (que lee antes de escribir) y descontaban el doble.
   *
   * El `updateMany` con `status: order.status` en el where es el que cierra la
   * carrera: si otro request ya movió la orden, afecta 0 filas y abortamos.
   */
  async setStatus(id: string, status: ProductionStatus, actorId: string): Promise<ProductionDetailDto> {
    const order = await this.prisma.productionOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Orden inexistente');
    if (!this.isValidTransition(order.status, status)) {
      throw new BadRequestException(`Transición no válida ${order.status} → ${status}`);
    }

    // Las líneas de consumo son sólo lecturas: se resuelven ANTES de abrir la
    // transacción para no alargarla con I/O que no necesita el lock.
    const lines =
      status === ProductionStatus.DONE
        ? await this.previewConsumption(order.productId, dec(order.quantity), {
            filamentOverrides: this.parseOverrides(order.filamentOverrides),
          })
        : [];

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.productionOrder.updateMany({
        where: { id, status: order.status },
        data: {
          status,
          ...(status === ProductionStatus.IN_PROGRESS && !order.startedAt && { startedAt: new Date() }),
          ...(status === ProductionStatus.DONE && { finishedAt: new Date() }),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'La orden cambió de estado mientras se procesaba. Recargá la página.',
        );
      }
      if (status === ProductionStatus.DONE) {
        await this.consumeStock(tx, order, lines, actorId);
      }
    });

    await this.audit.record({
      actorId,
      entity: 'ProductionOrder',
      entityId: id,
      action: 'status-change',
      before: { status: order.status },
      after: { status },
    });
    return this.get(id);
  }

  async previewConsumption(
    productId: string,
    quantity: number,
    options: { filamentOverrides?: Record<string, string> } = {},
  ): Promise<ProductionConsumptionLine[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        pieces: { orderBy: { sortOrder: 'asc' } },
        materials: { include: { material: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto inexistente');

    // For each piece, the consumed filament is the override (color child) when
    // present; otherwise the default itself (legacy / non-hierarchical filament).
    const consumedIds = new Set<string>();
    for (const piece of product.pieces) {
      const fid = options.filamentOverrides?.[piece.id] ?? piece.defaultFilamentId;
      if (fid) consumedIds.add(fid);
    }
    const consumedFilaments = consumedIds.size
      ? await this.prisma.material.findMany({
          where: { id: { in: [...consumedIds] } },
          include: { parent: true },
        })
      : [];
    const filamentMap = new Map(consumedFilaments.map((f) => [f.id, f]));

    // Group by consumed material (the child for hierarchical filaments, the
    // raw default otherwise) so stock is decremented at the right node.
    const filamentTotals = new Map<string, number>();
    for (const piece of product.pieces) {
      const fid = options.filamentOverrides?.[piece.id] ?? piece.defaultFilamentId;
      if (!fid) continue;
      const totalGrams = (filamentTotals.get(fid) ?? 0) + dec(piece.grams) * quantity;
      filamentTotals.set(fid, totalGrams);
    }

    const lines: ProductionConsumptionLine[] = [];

    for (const [filamentId, grams] of filamentTotals) {
      const fil = filamentMap.get(filamentId);
      if (!fil) continue;
      // Waste lives on the parent (or self for non-hierarchical rows).
      const priced = fil.parent ?? fil;
      const recipeQtyKg = grams / 1000;
      const wastePct = dec(priced.wastePct);
      lines.push({
        materialId: fil.id,
        materialName: fil.name,
        unit: fil.unit,
        recipeQty: recipeQtyKg,
        wastePct,
        totalQty: recipeQtyKg * (1 + wastePct / 100),
      });
    }

    for (const row of product.materials) {
      const recipeQty = dec(row.quantity) * quantity;
      const wastePct = dec(row.material.wastePct);
      lines.push({
        materialId: row.material.id,
        materialName: row.material.name,
        unit: row.material.unit,
        recipeQty,
        wastePct,
        totalQty: recipeQty * (1 + wastePct / 100),
      });
    }

    return lines;
  }

  // ----- internals -----

  /**
   * Descuenta el stock de las líneas dadas dentro de la transacción del caller.
   * No abre transacción propia a propósito: el descuento y el cambio de estado
   * de la orden tienen que confirmarse o revertirse juntos.
   */
  private async consumeStock(
    tx: Prisma.TransactionClient,
    order: { id: string; code: string },
    lines: ProductionConsumptionLine[],
    actorId: string,
  ): Promise<void> {
    for (const line of lines) {
      await tx.material.update({
        where: { id: line.materialId },
        data: { currentStock: { decrement: line.totalQty } },
      });
      await tx.stockMovement.create({
        data: {
          materialId: line.materialId,
          type: StockMovementType.OUT,
          quantity: line.totalQty,
          productionId: order.id,
          createdById: actorId,
          notes: `Consumo OP ${order.code}`,
        },
      });
    }
  }

  /** OP-YYYY-NNNN, reservado atómicamente (ver DocumentCodeService). */
  private nextCode(): Promise<string> {
    return this.codes.next('PRODUCTION', 'OP');
  }

  private isValidTransition(from: ProductionStatus, to: ProductionStatus): boolean {
    const allowed: Record<ProductionStatus, ProductionStatus[]> = {
      PLANNED: [ProductionStatus.IN_PROGRESS, ProductionStatus.CANCELLED, ProductionStatus.DONE],
      IN_PROGRESS: [ProductionStatus.DONE, ProductionStatus.CANCELLED],
      DONE: [],
      CANCELLED: [],
    };
    return allowed[from]?.includes(to) ?? false;
  }

  private parseOverrides(value: Prisma.JsonValue): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string') result[k] = v;
    }
    return Object.keys(result).length ? result : undefined;
  }

  private toDto(o: {
    id: string;
    code: string;
    productId: string;
    quantity: Prisma.Decimal;
    status: ProductionStatus;
    totalCostSnapshot: Prisma.Decimal;
    filamentOverrides: Prisma.JsonValue;
    startedAt: Date | null;
    finishedAt: Date | null;
    notes: string | null;
    createdById: string;
    createdAt: Date;
    product?: { name: string } | null;
  }): ProductionDto {
    return {
      id: o.id,
      code: o.code,
      productId: o.productId,
      productName: o.product?.name ?? '',
      quantity: dec(o.quantity),
      status: o.status,
      totalCostSnapshot: dec(o.totalCostSnapshot),
      filamentOverrides: this.parseOverrides(o.filamentOverrides) ?? null,
      startedAt: o.startedAt,
      finishedAt: o.finishedAt,
      notes: o.notes,
      createdById: o.createdById,
      createdAt: o.createdAt,
    };
  }
}
