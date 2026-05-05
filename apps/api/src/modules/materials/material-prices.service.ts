import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';

export interface PriceEntry {
  id: string;
  supplierId: string;
  supplierName: string;
  price: number;
  packSize: number | null;
  packPrice: number | null;
  currency: string;
  link: string | null;
  leadTimeDays: number | null;
  isCurrent: boolean;
  registeredAt: Date;
  notes: string | null;
}

export interface PriceInput {
  supplierId: string;
  /** Per-unit price. Required unless packSize + packPrice are provided (then derived). */
  price?: number;
  /** When provided alongside packPrice, derives the per-unit price. */
  packSize?: number | null;
  packPrice?: number | null;
  currency?: string;
  link?: string | null;
  leadTimeDays?: number | null;
  notes?: string | null;
  setCurrent?: boolean;
}

@Injectable()
export class MaterialPricesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(materialId: string): Promise<PriceEntry[]> {
    const prices = await this.prisma.supplierMaterial.findMany({
      where: { materialId },
      orderBy: [{ isCurrent: 'desc' }, { registeredAt: 'desc' }],
      include: { supplier: { select: { name: true } } },
    });
    return prices.map((p) => ({
      id: p.id,
      supplierId: p.supplierId,
      supplierName: p.supplier.name,
      price: dec(p.price),
      packSize: decOrNull(p.packSize),
      packPrice: decOrNull(p.packPrice),
      currency: p.currency,
      link: p.link,
      leadTimeDays: p.leadTimeDays,
      isCurrent: p.isCurrent,
      registeredAt: p.registeredAt,
      notes: p.notes,
    }));
  }

  async create(materialId: string, input: PriceInput): Promise<PriceEntry> {
    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Insumo inexistente');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor inexistente');

    const { unitPrice, packSize, packPrice } = this.resolvePrice(input);

    const setCurrent = input.setCurrent ?? false;
    const created = await this.prisma.$transaction(async (tx) => {
      if (setCurrent) {
        await tx.supplierMaterial.updateMany({
          where: { materialId, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      return tx.supplierMaterial.create({
        data: {
          materialId,
          supplierId: input.supplierId,
          price: unitPrice,
          packSize,
          packPrice,
          currency: input.currency ?? 'ARS',
          link: input.link ?? null,
          leadTimeDays: input.leadTimeDays ?? null,
          notes: input.notes ?? null,
          isCurrent: setCurrent,
        },
        include: { supplier: { select: { name: true } } },
      });
    });
    return {
      id: created.id,
      supplierId: created.supplierId,
      supplierName: created.supplier.name,
      price: dec(created.price),
      packSize: decOrNull(created.packSize),
      packPrice: decOrNull(created.packPrice),
      currency: created.currency,
      link: created.link,
      leadTimeDays: created.leadTimeDays,
      isCurrent: created.isCurrent,
      registeredAt: created.registeredAt,
      notes: created.notes,
    };
  }

  /**
   * Resolve the per-unit price from either:
   *   (a) a direct `price` (legacy mode), or
   *   (b) packSize + packPrice (we compute price = packPrice / packSize).
   * Both modes can't coexist in the same request.
   */
  private resolvePrice(input: PriceInput): {
    unitPrice: number;
    packSize: number | null;
    packPrice: number | null;
  } {
    const hasPack = input.packSize != null && input.packPrice != null;
    const hasDirect = input.price != null;

    if (hasPack) {
      const size = Number(input.packSize);
      const total = Number(input.packPrice);
      if (!Number.isFinite(size) || size <= 0) {
        throw new BadRequestException('La cantidad por paquete debe ser mayor a 0');
      }
      if (!Number.isFinite(total) || total <= 0) {
        throw new BadRequestException('El precio del paquete debe ser mayor a 0');
      }
      return { unitPrice: total / size, packSize: size, packPrice: total };
    }
    if (hasDirect) {
      const price = Number(input.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new BadRequestException('El precio debe ser mayor a 0');
      }
      return { unitPrice: price, packSize: null, packPrice: null };
    }
    throw new BadRequestException(
      'Cargá un precio: por unidad, o cantidad + precio del paquete.',
    );
  }

  async setCurrent(materialId: string, priceId: string): Promise<PriceEntry[]> {
    const price = await this.prisma.supplierMaterial.findUnique({ where: { id: priceId } });
    if (!price || price.materialId !== materialId) {
      throw new NotFoundException('Precio inexistente');
    }
    await this.prisma.$transaction([
      this.prisma.supplierMaterial.updateMany({
        where: { materialId, isCurrent: true },
        data: { isCurrent: false },
      }),
      this.prisma.supplierMaterial.update({
        where: { id: priceId },
        data: { isCurrent: true },
      }),
    ]);
    return this.list(materialId);
  }

  async remove(materialId: string, priceId: string): Promise<void> {
    const price = await this.prisma.supplierMaterial.findUnique({ where: { id: priceId } });
    if (!price || price.materialId !== materialId) {
      throw new NotFoundException('Precio inexistente');
    }
    await this.prisma.supplierMaterial.delete({ where: { id: priceId } });
  }
}
