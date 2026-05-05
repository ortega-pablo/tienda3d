import { Injectable } from '@nestjs/common';
import { ProductionStatus, QuoteStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';

export interface DashboardKpis {
  quotesThisMonth: { count: number; total: number };
  quotesByStatus: Record<QuoteStatus, number>;
  productionsActive: number;
  productionsThisMonth: { count: number; totalCost: number };
  topProducts: Array<{ productId: string; name: string; quoted: number; produced: number }>;
  lowStock: Array<{
    materialId: string;
    name: string;
    currentStock: number;
    minStock: number;
    unit: string;
  }>;
  stockValue: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(): Promise<DashboardKpis> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      monthQuotes,
      quotesByStatusRows,
      activeProductions,
      monthProductions,
      lowStockMaterials,
      allMaterialsWithPrice,
    ] = await Promise.all([
      this.prisma.quote.findMany({
        where: { createdAt: { gte: monthStart } },
        select: { total: true },
      }),
      this.prisma.quote.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.productionOrder.count({
        where: { status: { in: [ProductionStatus.PLANNED, ProductionStatus.IN_PROGRESS] } },
      }),
      this.prisma.productionOrder.findMany({
        where: { createdAt: { gte: monthStart } },
        select: { totalCostSnapshot: true },
      }),
      this.prisma.material.findMany({
        where: { lowStockAlert: true, isActive: true },
        select: {
          id: true,
          name: true,
          currentStock: true,
          minStock: true,
          unit: true,
        },
      }),
      this.prisma.material.findMany({
        where: { isActive: true },
        select: {
          id: true,
          currentStock: true,
          unit: true,
          suppliers: {
            where: { isCurrent: true },
            take: 1,
            select: { price: true },
          },
        },
      }),
    ]);

    const quotesByStatus = Object.fromEntries(
      Object.values(QuoteStatus).map((s) => [s, 0]),
    ) as Record<QuoteStatus, number>;
    for (const row of quotesByStatusRows) quotesByStatus[row.status] = row._count._all;

    const lowStock = lowStockMaterials
      .filter((m) => dec(m.currentStock) < dec(m.minStock))
      .map((m) => ({
        materialId: m.id,
        name: m.name,
        currentStock: dec(m.currentStock),
        minStock: dec(m.minStock),
        unit: m.unit,
      }));

    const stockValue = allMaterialsWithPrice.reduce((acc, m) => {
      const price = m.suppliers[0]?.price;
      if (!price) return acc;
      return acc + dec(m.currentStock) * dec(price);
    }, 0);

    const topProducts = await this.computeTopProducts(monthStart);

    return {
      quotesThisMonth: {
        count: monthQuotes.length,
        total: monthQuotes.reduce((acc, q) => acc + dec(q.total), 0),
      },
      quotesByStatus,
      productionsActive: activeProductions,
      productionsThisMonth: {
        count: monthProductions.length,
        totalCost: monthProductions.reduce((acc, p) => acc + dec(p.totalCostSnapshot), 0),
      },
      topProducts,
      lowStock,
      stockValue,
    };
  }

  private async computeTopProducts(
    monthStart: Date,
  ): Promise<DashboardKpis['topProducts']> {
    const [quotedItems, producedOrders] = await Promise.all([
      this.prisma.quoteItem.groupBy({
        by: ['productId'],
        where: {
          productId: { not: null },
          quote: { createdAt: { gte: monthStart } },
        },
        _sum: { quantity: true },
      }),
      this.prisma.productionOrder.groupBy({
        by: ['productId'],
        where: { createdAt: { gte: monthStart } },
        _sum: { quantity: true },
      }),
    ]);

    const productIds = new Set<string>();
    for (const q of quotedItems) if (q.productId) productIds.add(q.productId);
    for (const p of producedOrders) productIds.add(p.productId);
    if (productIds.size === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(products.map((p) => [p.id, p.name]));

    const stats = new Map<string, { quoted: number; produced: number }>();
    for (const id of productIds) stats.set(id, { quoted: 0, produced: 0 });
    for (const q of quotedItems) {
      if (!q.productId) continue;
      stats.get(q.productId)!.quoted = dec(q._sum.quantity ?? 0);
    }
    for (const p of producedOrders) {
      stats.get(p.productId)!.produced = dec(p._sum.quantity ?? 0);
    }

    return [...stats.entries()]
      .map(([productId, s]) => ({
        productId,
        name: nameById.get(productId) ?? productId,
        quoted: s.quoted,
        produced: s.produced,
      }))
      .sort((a, b) => b.quoted + b.produced - (a.quoted + a.produced))
      .slice(0, 5);
  }
}
