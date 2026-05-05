import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';

@Injectable()
export class CsvService {
  constructor(private readonly prisma: PrismaService) {}

  async quotesCsv(): Promise<string> {
    const quotes = await this.prisma.quote.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        channel: { select: { name: true } },
        items: { select: { id: true } },
      },
    });
    const rows = quotes.map((q) => ({
      Codigo: q.code,
      Cliente: q.customerName,
      Email: q.customerEmail ?? '',
      Telefono: q.customerPhone ?? '',
      Tipo: q.type,
      Estado: q.status,
      Canal: q.channel?.name ?? '',
      ConFactura: q.withInvoice ? 'Sí' : 'No',
      Items: q.items.length,
      Subtotal: dec(q.subtotal).toFixed(2),
      Descuento: dec(q.discount).toFixed(2),
      Total: dec(q.total).toFixed(2),
      Fecha: q.createdAt.toISOString(),
      ValidaHasta: q.validUntil ? q.validUntil.toISOString() : '',
    }));
    return toCsv(rows);
  }

  async stockMovementsCsv(materialId: string | undefined): Promise<string> {
    const movements = await this.prisma.stockMovement.findMany({
      where: materialId ? { materialId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        material: { select: { name: true, unit: true } },
        production: { select: { code: true } },
        createdBy: { select: { name: true } },
      },
    });
    const rows = movements.map((m) => ({
      Fecha: m.createdAt.toISOString(),
      Insumo: m.material.name,
      Tipo: m.type,
      Cantidad: dec(m.quantity).toFixed(3),
      Unidad: m.material.unit,
      OP: m.production?.code ?? '',
      Notas: m.notes ?? '',
      Usuario: m.createdBy.name,
    }));
    return toCsv(rows);
  }

  async stockSnapshotCsv(): Promise<string> {
    const materials = await this.prisma.material.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        suppliers: {
          where: { isCurrent: true },
          take: 1,
          include: { supplier: { select: { name: true } } },
        },
      },
    });
    const rows = materials.map((m) => {
      const current = m.suppliers[0];
      const stock = dec(m.currentStock);
      const price = current ? dec(current.price) : 0;
      return {
        Insumo: m.name,
        SKU: m.sku ?? '',
        Tipo: m.type,
        Marca: m.brand ?? '',
        Color: m.color ?? '',
        Stock: stock.toFixed(3),
        Unidad: m.unit,
        StockMinimo: dec(m.minStock).toFixed(3),
        DesperdicioPct: dec(m.wastePct).toFixed(2),
        ProveedorVigente: current?.supplier.name ?? '',
        PrecioVigente: price.toFixed(2),
        ValorEnStock: (price * stock).toFixed(2),
      };
    });
    return toCsv(rows);
  }
}

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}
