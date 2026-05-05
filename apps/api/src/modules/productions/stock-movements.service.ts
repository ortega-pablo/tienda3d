import { Injectable } from '@nestjs/common';
import type { StockMovementType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';

export interface StockMovementDto {
  id: string;
  materialId: string;
  materialName: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number | null;
  productionId: string | null;
  productionCode: string | null;
  notes: string | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
}

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: { materialId?: string; limit?: number }): Promise<StockMovementDto[]> {
    const movements = await this.prisma.stockMovement.findMany({
      where: filters.materialId ? { materialId: filters.materialId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
      include: {
        material: { select: { name: true } },
        production: { select: { code: true } },
        createdBy: { select: { name: true } },
      },
    });
    return movements.map((m) => ({
      id: m.id,
      materialId: m.materialId,
      materialName: m.material.name,
      type: m.type,
      quantity: dec(m.quantity),
      unitCost: decOrNull(m.unitCost),
      productionId: m.productionId,
      productionCode: m.production?.code ?? null,
      notes: m.notes,
      createdById: m.createdById,
      createdByName: m.createdBy.name,
      createdAt: m.createdAt,
    }));
  }
}
