import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelKind, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';

export interface ProductPieceDto {
  id: string;
  name: string;
  grams: number;
  printMinutes: number;
  defaultFilamentId: string | null;
  defaultFilamentName: string | null;
  defaultFilamentColorHex: string | null;
  sortOrder: number;
}

export interface ProductMaterialDto {
  id: string;
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
}

export interface ProductChannelDto {
  channelId: string;
  channelName: string;
  channelSlug: string;
  channelKind: ChannelKind;
  isEnabled: boolean;
  /** Required for MARKETPLACE; ignored for DIRECT_SALE/CASH (rules are global). */
  commissionPct: number | null;
  notes: string | null;
}

export interface ProductDto {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  marketingMonthly: number;
  estimatedUnitsMonth: number;
  assemblyMinutes: number;
  managementMinutes: number;
  /** Markup over cost — drives the absolute profit per unit (Logic B). */
  targetMarkupPct: number;
  /** Operational metadata: which printer manufactures this product. */
  machineId: string | null;
  machineName: string | null;
  /** Categoría del producto (jerarquía de 2 niveles). Nullable. */
  categoryId: string | null;
  categoryName: string | null;
  /** Si la categoría es subcategoría, el id de su padre. */
  categoryParentId: string | null;
  pieces: ProductPieceDto[];
  materials: ProductMaterialDto[];
  channels: ProductChannelDto[];
  totalGrams: number;
  totalPrintMinutes: number;
}

export interface ProductSummaryDto {
  id: string;
  name: string;
  sku: string | null;
  isActive: boolean;
  imageUrl: string | null;
  pieceCount: number;
  materialCount: number;
  totalGrams: number;
  totalPrintMinutes: number;
  machineId: string | null;
  machineName: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

interface PieceInput {
  id?: string;
  name: string;
  grams: number;
  printMinutes: number;
  defaultFilamentId: string | null;
  sortOrder?: number;
}
interface MaterialLineInput {
  materialId: string;
  quantity: number;
}
export interface ProductChannelInput {
  channelId: string;
  isEnabled: boolean;
  /** Only used for MARKETPLACE channels; ignored elsewhere. */
  commissionPct?: number | null;
  notes?: string | null;
}
export interface ProductInput {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  marketingMonthly: number;
  estimatedUnitsMonth: number;
  assemblyMinutes: number;
  managementMinutes: number;
  targetMarkupPct: number;
  machineId: string | null;
  categoryId?: string | null;
  pieces: PieceInput[];
  materials: MaterialLineInput[];
  channels?: ProductChannelInput[];
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProductSummaryDto[]> {
    const products = await this.prisma.product.findMany({
      orderBy: { name: 'asc' },
      include: {
        pieces: true,
        materials: true,
        machine: { select: { name: true } },
        category: { select: { name: true, parentId: true } },
      },
    });
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      isActive: p.isActive,
      imageUrl: p.imageUrl,
      pieceCount: p.pieces.length,
      materialCount: p.materials.length,
      totalGrams: p.pieces.reduce((acc, piece) => acc + dec(piece.grams), 0),
      totalPrintMinutes: p.pieces.reduce((acc, piece) => acc + dec(piece.printMinutes), 0),
      machineId: p.machineId,
      machineName: p.machine?.name ?? null,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
    }));
  }

  async get(id: string): Promise<ProductDto> {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        pieces: {
          orderBy: { sortOrder: 'asc' },
          include: { defaultFilament: true },
        },
        materials: { include: { material: true } },
        channels: { include: { channel: true } },
        machine: { select: { name: true } },
        category: { select: { name: true, parentId: true } },
      },
    });
    if (!p) throw new NotFoundException('Producto inexistente');
    return this.toDto(p);
  }

  async create(input: ProductInput): Promise<ProductDto> {
    if (!input.machineId) {
      throw new BadRequestException(
        'Asigná la máquina (impresora) en la que se fabrica este producto.',
      );
    }
    await this.assertMachineExists(input.machineId);
    if (input.categoryId) await this.assertCategoryExists(input.categoryId);
    if (input.pieces.length === 0 && input.materials.length === 0) {
      throw new BadRequestException(
        'El producto debe tener al menos una pieza impresa o un insumo',
      );
    }

    const channels = await this.resolveChannels(input.channels);
    await this.validateChannels(channels);

    // SKU auto-generado. La secuencia Postgres es atómica: dos creaciones
    // simultáneas reciben números distintos sin colisión.
    const sku = await this.generateNextSku();

    const product = await this.prisma.product.create({
      data: {
        name: input.name,
        sku,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        isActive: input.isActive ?? true,
        marketingMonthly: input.marketingMonthly,
        estimatedUnitsMonth: input.estimatedUnitsMonth,
        assemblyMinutes: input.assemblyMinutes,
        managementMinutes: input.managementMinutes,
        targetMarkupPct: input.targetMarkupPct,
        machineId: input.machineId,
        categoryId: input.categoryId ?? null,
        pieces: {
          create: input.pieces.map((piece, idx) => ({
            name: piece.name,
            grams: piece.grams,
            printMinutes: piece.printMinutes,
            defaultFilamentId: piece.defaultFilamentId,
            sortOrder: piece.sortOrder ?? idx,
          })),
        },
        materials: {
          create: input.materials.map((m) => ({
            materialId: m.materialId,
            quantity: m.quantity,
          })),
        },
        channels: {
          create: channels.map((c) => ({
            channelId: c.channelId,
            isEnabled: c.isEnabled,
            commissionPct: c.commissionPct ?? null,
            notes: c.notes ?? null,
          })),
        },
      },
    });
    return this.get(product.id);
  }

  async update(id: string, input: ProductInput): Promise<ProductDto> {
    const exists = await this.prisma.product.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Producto inexistente');
    // El SKU es inmutable: se asigna al crear y nunca cambia (incluso si el
    // usuario lo mandara en el payload, lo ignoramos).

    if (!input.machineId) {
      throw new BadRequestException(
        'Asigná la máquina (impresora) en la que se fabrica este producto.',
      );
    }
    if (input.machineId !== exists.machineId) {
      await this.assertMachineExists(input.machineId);
    }
    if (input.categoryId && input.categoryId !== exists.categoryId) {
      await this.assertCategoryExists(input.categoryId);
    }
    if (input.pieces.length === 0 && input.materials.length === 0) {
      throw new BadRequestException(
        'El producto debe tener al menos una pieza impresa o un insumo',
      );
    }

    const channelsToPersist = await this.resolveChannels(input.channels);
    await this.validateChannels(channelsToPersist);

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: input.name,
          // sku no se incluye: es inmutable, vive desde la creación.
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          isActive: input.isActive ?? true,
          marketingMonthly: input.marketingMonthly,
          estimatedUnitsMonth: input.estimatedUnitsMonth,
          assemblyMinutes: input.assemblyMinutes,
          managementMinutes: input.managementMinutes,
          targetMarkupPct: input.targetMarkupPct,
          machineId: input.machineId,
          categoryId: input.categoryId ?? null,
        },
      });
      await tx.productPiece.deleteMany({ where: { productId: id } });
      await tx.productMaterial.deleteMany({ where: { productId: id } });
      if (input.pieces.length) {
        await tx.productPiece.createMany({
          data: input.pieces.map((piece, idx) => ({
            productId: id,
            name: piece.name,
            grams: piece.grams,
            printMinutes: piece.printMinutes,
            defaultFilamentId: piece.defaultFilamentId,
            sortOrder: piece.sortOrder ?? idx,
          })),
        });
      }
      if (input.materials.length) {
        await tx.productMaterial.createMany({
          data: input.materials.map((m) => ({
            productId: id,
            materialId: m.materialId,
            quantity: m.quantity,
          })),
        });
      }

      // Reconcile channels: upsert each, drop tiers for newly-disabled channels.
      for (const c of channelsToPersist) {
        await tx.productChannel.upsert({
          where: { productId_channelId: { productId: id, channelId: c.channelId } },
          create: {
            productId: id,
            channelId: c.channelId,
            isEnabled: c.isEnabled,
            commissionPct: c.commissionPct ?? null,
            notes: c.notes ?? null,
          },
          update: {
            isEnabled: c.isEnabled,
            commissionPct: c.commissionPct ?? null,
            notes: c.notes ?? null,
          },
        });
      }
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const usedInQuotes = await this.prisma.quoteItem.count({ where: { productId: id } });
    const usedInProduction = await this.prisma.productionOrder.count({
      where: { productId: id },
    });
    if (usedInQuotes > 0 || usedInProduction > 0) {
      await this.prisma.product.update({ where: { id }, data: { isActive: false } });
      return;
    }
    await this.prisma.product.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Producto inexistente');
    });
  }

  // ----- internals -----

  /**
   * Resolve channel inputs, defaulting to enabling all system channels (Directa,
   * Efectivo) when the caller doesn't send any. MELI is opt-in so it never gets
   * auto-enabled — the caller has to ask for it explicitly (and provide the
   * commission, validated below).
   */
  private async resolveChannels(
    requested: ProductChannelInput[] | undefined,
  ): Promise<ProductChannelInput[]> {
    if (requested && requested.length > 0) return requested;

    const defaults = await this.prisma.channel.findMany({
      where: {
        isActive: true,
        isSystem: true,
        kind: { in: [ChannelKind.DIRECT_SALE, ChannelKind.CASH] },
      },
      select: { id: true },
    });
    return defaults.map((c) => ({ channelId: c.id, isEnabled: true }));
  }

  private async validateChannels(channels: ProductChannelInput[]): Promise<void> {
    if (channels.length === 0) return;
    const channelIds = channels.map((c) => c.channelId);
    const channelsDb = await this.prisma.channel.findMany({
      where: { id: { in: channelIds } },
    });
    const byId = new Map(channelsDb.map((c) => [c.id, c]));

    for (const c of channels) {
      const ch = byId.get(c.channelId);
      if (!ch) throw new BadRequestException(`Canal ${c.channelId} inexistente`);
      if (c.isEnabled && ch.kind === ChannelKind.MARKETPLACE && c.commissionPct == null) {
        throw new BadRequestException(
          `${ch.name} requiere cargar la comisión por producto antes de habilitarlo.`,
        );
      }
    }
  }

  /**
   * Genera el próximo SKU disponible usando la secuencia Postgres
   * `product_sku_seq`. La secuencia es atómica: dos creaciones concurrentes
   * reciben números distintos sin race condition.
   *
   * Formato: PTK-PROD-NNNNNN (PTK-PROD-000001, PTK-PROD-000002, ...).
   * Las variantes futuras agregan -V01, -V02, ... al final.
   */
  private async generateNextSku(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ next: bigint }>>`
      SELECT nextval('product_sku_seq') AS next
    `;
    const n = rows[0]?.next ?? BigInt(1);
    return `PTK-PROD-${n.toString().padStart(6, '0')}`;
  }

  private async assertMachineExists(machineId: string): Promise<void> {
    const machine = await this.prisma.machine.findUnique({ where: { id: machineId } });
    if (!machine) throw new BadRequestException('Máquina inexistente');
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new BadRequestException('Categoría inexistente');
  }

  private toDto(
    p: Prisma.ProductGetPayload<{
      include: {
        pieces: { include: { defaultFilament: true } };
        materials: { include: { material: true } };
        channels: { include: { channel: true } };
        machine: { select: { name: true } };
        category: { select: { name: true; parentId: true } };
      };
    }>,
  ): ProductDto {
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      imageUrl: p.imageUrl,
      isActive: p.isActive,
      marketingMonthly: dec(p.marketingMonthly),
      estimatedUnitsMonth: dec(p.estimatedUnitsMonth),
      assemblyMinutes: dec(p.assemblyMinutes),
      managementMinutes: dec(p.managementMinutes),
      targetMarkupPct: dec(p.targetMarkupPct),
      machineId: p.machineId,
      machineName: p.machine?.name ?? null,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      categoryParentId: p.category?.parentId ?? null,
      pieces: p.pieces.map((piece) => ({
        id: piece.id,
        name: piece.name,
        grams: dec(piece.grams),
        printMinutes: dec(piece.printMinutes),
        defaultFilamentId: piece.defaultFilamentId,
        defaultFilamentName: piece.defaultFilament?.name ?? null,
        defaultFilamentColorHex: piece.defaultFilament?.colorHex ?? null,
        sortOrder: piece.sortOrder,
      })),
      materials: p.materials.map((m) => ({
        id: m.id,
        materialId: m.materialId,
        materialName: m.material.name,
        unit: m.material.unit,
        quantity: dec(m.quantity),
      })),
      channels: p.channels.map((pc) => ({
        channelId: pc.channelId,
        channelName: pc.channel.name,
        channelSlug: pc.channel.slug,
        channelKind: pc.channel.kind,
        isEnabled: pc.isEnabled,
        commissionPct: decOrNull(pc.commissionPct),
        notes: pc.notes,
      })),
      totalGrams: p.pieces.reduce((acc, piece) => acc + dec(piece.grams), 0),
      totalPrintMinutes: p.pieces.reduce((acc, piece) => acc + dec(piece.printMinutes), 0),
    };
  }
}
