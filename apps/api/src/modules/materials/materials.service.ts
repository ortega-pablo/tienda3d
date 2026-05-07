import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialType, MaterialUnit, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';

export interface MaterialDto {
  id: string;
  name: string;
  sku: string | null;
  type: MaterialType;
  unit: MaterialUnit;
  parentId: string | null;
  brand: string | null;
  color: string | null;
  colorHex: string | null;
  densityGCm3: number | null;
  wastePct: number;
  /** % de reabastecimiento aplicado sobre el costo bruto del insumo. */
  replenishmentMarkupPct: number;
  currentStock: number;
  minStock: number;
  lowStockAlert: boolean;
  notes: string | null;
  imageUrl: string | null;
  isActive: boolean;
  currentPrice: {
    id: string;
    price: number;
    packSize: number | null;
    packPrice: number | null;
    currency: string;
    supplierName: string;
  } | null;
  /** Color variants — populated for filament parents only. */
  children?: MaterialDto[];
}

export interface MaterialInput {
  name: string;
  sku?: string | null;
  type: MaterialType;
  unit: MaterialUnit;
  parentId?: string | null;
  brand?: string | null;
  color?: string | null;
  colorHex?: string | null;
  densityGCm3?: number | null;
  wastePct?: number;
  replenishmentMarkupPct?: number;
  currentStock?: number;
  minStock?: number;
  lowStockAlert?: boolean;
  notes?: string | null;
  imageUrl?: string | null;
}

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: { type?: MaterialType; activeOnly?: boolean }): Promise<MaterialDto[]> {
    const where: Prisma.MaterialWhereInput = { parentId: null };
    if (filters.type) where.type = filters.type;
    if (filters.activeOnly) where.isActive = true;

    const materials = await this.prisma.material.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        suppliers: {
          where: { isCurrent: true },
          take: 1,
          include: { supplier: { select: { name: true } } },
        },
        children: {
          where: filters.activeOnly ? { isActive: true } : undefined,
          orderBy: { name: 'asc' },
          include: {
            suppliers: {
              where: { isCurrent: true },
              take: 1,
              include: { supplier: { select: { name: true } } },
            },
              },
        },
      },
    });
    return materials.map((m) => this.toDto(m));
  }

  async get(id: string): Promise<MaterialDto> {
    const m = await this.prisma.material.findUnique({
      where: { id },
      include: {
        suppliers: {
          where: { isCurrent: true },
          take: 1,
          include: { supplier: { select: { name: true } } },
        },
        children: {
          orderBy: { name: 'asc' },
          include: {
            suppliers: {
              where: { isCurrent: true },
              take: 1,
              include: { supplier: { select: { name: true } } },
            },
              },
        },
      },
    });
    if (!m) throw new NotFoundException('Insumo inexistente');
    return this.toDto(m);
  }

  async create(input: MaterialInput): Promise<MaterialDto> {
    if (input.sku) {
      const exists = await this.prisma.material.findUnique({ where: { sku: input.sku } });
      if (exists) throw new ConflictException('SKU ya registrado');
    }

    if (input.parentId) {
      // Child: must be FILAMENT and point to an existing FILAMENT parent (top-level).
      if (input.type !== MaterialType.FILAMENT) {
        throw new BadRequestException('Solo los filamentos pueden tener padre');
      }
      const parent = await this.prisma.material.findUnique({ where: { id: input.parentId } });
      if (!parent) throw new BadRequestException('Padre inexistente');
      if (parent.type !== MaterialType.FILAMENT) {
        throw new BadRequestException('El padre debe ser un filamento');
      }
      if (parent.parentId) {
        throw new BadRequestException('No se permite jerarquía de más de un nivel');
      }
      if (!input.color) {
        throw new BadRequestException('Una variante de filamento requiere color');
      }
    } else if (input.type === MaterialType.FILAMENT) {
      // Filament parent: color must NOT be set on the parent (lives on children).
      if (input.color) {
        throw new BadRequestException(
          'El padre de filamento no lleva color. Cargalo en cada variante.',
        );
      }
    }

    const created = await this.prisma.material.create({
      data: {
        name: input.name,
        sku: input.sku ?? null,
        type: input.type,
        unit: input.unit,
        parentId: input.parentId ?? null,
        brand: input.brand ?? null,
        color: input.color ?? null,
        colorHex: input.colorHex ?? null,
        densityGCm3: input.densityGCm3 ?? null,
        wastePct: input.wastePct ?? 5,
        replenishmentMarkupPct: input.replenishmentMarkupPct ?? 15,
        currentStock: input.currentStock ?? 0,
        minStock: input.minStock ?? 0,
        lowStockAlert: input.lowStockAlert ?? true,
        notes: input.notes ?? null,
        imageUrl: input.imageUrl ?? null,
      },
    });
    return this.get(created.id);
  }

  async update(id: string, input: Partial<MaterialInput> & { isActive?: boolean }): Promise<MaterialDto> {
    const existing = await this.prisma.material.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Insumo inexistente');

    if (input.sku) {
      const conflict = await this.prisma.material.findFirst({
        where: { sku: input.sku, NOT: { id } },
      });
      if (conflict) throw new ConflictException('SKU ya registrado');
    }

    // parentId is part of the structural identity — can't be reassigned after creation.
    if (input.parentId !== undefined && (input.parentId ?? null) !== existing.parentId) {
      throw new BadRequestException(
        'No se puede cambiar la jerarquía de un insumo. Eliminá y recreá si necesitás reagrupar.',
      );
    }

    const { parentId: _ignored, ...updateData } = input;
    void _ignored;

    await this.prisma.material
      .update({ where: { id }, data: updateData })
      .catch(() => {
        throw new NotFoundException('Insumo inexistente');
      });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { children: { select: { id: true } } },
    });
    if (!material) throw new NotFoundException('Insumo inexistente');

    const childIds = material.children.map((c) => c.id);
    const ids = [id, ...childIds];
    const isFilament = material.type === MaterialType.FILAMENT;

    // Collect product references (recipes + piece defaults) to know whether
    // anything depends on this material or any of its variants.
    const [productMaterialRefs, pieceRefs, hasMovements] = await Promise.all([
      this.prisma.productMaterial.findMany({
        where: { materialId: { in: ids } },
        include: { product: { select: { name: true } } },
      }),
      this.prisma.productPiece.findMany({
        where: { defaultFilamentId: { in: ids } },
        include: { product: { select: { name: true } } },
      }),
      this.prisma.stockMovement.count({ where: { materialId: { in: ids } } }),
    ]);

    const productNames = new Set<string>();
    for (const pm of productMaterialRefs) productNames.add(pm.product.name);
    for (const pp of pieceRefs) productNames.add(pp.product.name);
    const usedInProducts = productNames.size > 0;

    // Filaments (parent or variant) can't be removed while any product
    // references them — deleting would silently break the recipe. Force the
    // user to detach the products first.
    if (isFilament && usedInProducts) {
      const names = [...productNames];
      const sample = names.slice(0, 3).join(', ');
      const more = names.length > 3 ? ` y ${names.length - 3} más` : '';
      throw new BadRequestException(
        `No se puede eliminar: ${names.length} producto(s) lo tienen asignado (${sample}${more}). Quitalo del producto primero.`,
      );
    }

    // Non-filament materials with history fall back to soft-delete so we
    // don't lose audit trail or orphan stock movements.
    if (usedInProducts || hasMovements > 0) {
      await this.prisma.material.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false },
      });
      return;
    }

    // Cascade FK handles children rows automatically.
    await this.prisma.material.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Insumo inexistente');
    });
  }

  /** Manual stock adjustment that records a movement. Filament parents are not stockable. */
  async adjustStock(
    id: string,
    actorId: string,
    delta: number,
    notes: string | null,
  ): Promise<MaterialDto> {
    if (delta === 0) return this.get(id);
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { children: { select: { id: true } } },
    });
    if (!material) throw new NotFoundException('Insumo inexistente');
    if (material.type === MaterialType.FILAMENT && material.children.length > 0) {
      throw new BadRequestException(
        'El padre de filamento no acumula stock. Ajustalo en una de sus variantes.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.material.update({
        where: { id },
        data: { currentStock: { increment: delta } },
      }),
      this.prisma.stockMovement.create({
        data: {
          materialId: id,
          type: 'ADJUSTMENT',
          quantity: Math.abs(delta),
          notes,
          createdById: actorId,
        },
      }),
    ]);
    return this.get(id);
  }

  private toDto(m: MaterialWithRelations): MaterialDto {
    const current = m.suppliers?.[0];
    const dto: MaterialDto = {
      id: m.id,
      name: m.name,
      sku: m.sku,
      type: m.type,
      unit: m.unit,
      parentId: m.parentId,
      brand: m.brand,
      color: m.color,
      colorHex: m.colorHex,
      densityGCm3: decOrNull(m.densityGCm3),
      wastePct: dec(m.wastePct),
      replenishmentMarkupPct: dec(m.replenishmentMarkupPct),
      currentStock: dec(m.currentStock),
      minStock: dec(m.minStock),
      lowStockAlert: m.lowStockAlert,
      notes: m.notes,
      imageUrl: m.imageUrl,
      isActive: m.isActive,
      currentPrice: current
        ? {
            id: current.id,
            price: dec(current.price),
            packSize: decOrNull(current.packSize),
            packPrice: decOrNull(current.packPrice),
            currency: current.currency,
            supplierName: current.supplier.name,
          }
        : null,
    };
    if (Array.isArray(m.children)) {
      dto.children = m.children.map((c) => this.toDto(c));
    }
    return dto;
  }
}

/**
 * Loose row shape we accept in toDto — supports both top-level rows (with
 * children + suppliers) and nested children (with suppliers only).
 */
type MaterialWithRelations = Prisma.MaterialGetPayload<{}> & {
  suppliers?: Array<
    Prisma.SupplierMaterialGetPayload<{ include: { supplier: { select: { name: true } } } }>
  >;
  children?: MaterialWithRelations[];
};
