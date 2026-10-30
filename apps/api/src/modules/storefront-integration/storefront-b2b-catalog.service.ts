import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { startOfBusinessMonth } from '@/common/utils/date';
import { CustomerCatalogPdfService } from '@/modules/customers/customer-catalog-pdf.service';
import {
  CustomerCatalogService,
  type CatalogProduct,
} from '@/modules/customers/customer-catalog.service';

/** Los que tienen trato propio (D18). */
const B2B_TYPES: CustomerType[] = [
  CustomerType.WHOLESALE,
  CustomerType.CONSIGNMENT,
  CustomerType.SPECIAL,
];

export interface B2bCatalogTier {
  minQty: number;
  maxQty: number | null;
  unitPriceCents: number;
}

export interface B2bCatalogPiece {
  pieceId: string;
  name: string;
  colors: Array<{ id: string; name: string; hex: string | null }>;
}

export interface B2bCatalogProduct {
  productId: string;
  name: string;
  sku: string | null;
  description: string | null;
  categoryName: string | null;
  /** Ruta en el volumen `media`: la primera foto de su publicación en la tienda. */
  imagePath: string | null;
  tiers: B2bCatalogTier[];
  /** Precio único, si el producto no tiene escalas. */
  basePriceCents: number | null;
  /** Las piezas con color a elegir: los hijos activos de su línea de filamento. */
  pieces: B2bCatalogPiece[];
}

export interface B2bCommitment {
  categoryName: string;
  committedQty: number;
  soldQty: number;
  suspended: boolean;
}

export interface B2bCatalog {
  customerName: string;
  customerType: CustomerType;
  channelName: string | null;
  generatedAt: string;
  products: B2bCatalogProduct[];
  /** Compromisos del mes (mayoristas). */
  commitments: B2bCommitment[];
}

const toCents = (pesos: number) => Math.round(pesos * 100);

/**
 * El catálogo de un cliente B2B para la tienda (F21·1, D18): lo que puede
 * comprar, con sus precios de Venta Directa. Sale del mismo cálculo que la
 * ficha, **sin márgenes ni ganancias**: esos son datos internos del taller.
 */
@Injectable()
export class StorefrontB2bCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CustomerCatalogService,
    private readonly pdf: CustomerCatalogPdfService,
  ) {}

  /** Si la cuenta tiene catálogo, sin calcular precios: la tienda lo pregunta para mostrar el link. */
  async access(externalId: string): Promise<{ enabled: boolean }> {
    return { enabled: (await this.find(externalId)) !== null };
  }

  /** `externalId`: la cuenta del sitio vinculada a la ficha. */
  async forAccount(externalId: string, now = new Date()): Promise<B2bCatalog> {
    const customer = await this.enabled(externalId);
    const data = await this.catalog.forCustomer(customer.id);
    const priced = data.products.filter((p) => p.tiers.length > 0 || p.basePrice !== null);
    const ids = priced.map((p) => p.productId);
    const [images, pieces, commitments] = await Promise.all([
      this.images(ids),
      this.pieces(ids),
      this.commitments(customer.id, now),
    ]);
    return {
      customerName: data.customerName,
      customerType: data.customerType,
      channelName: data.channelName,
      generatedAt: data.generatedAt,
      products: priced.map((p) => toPublic(p, images.get(p.productId), pieces.get(p.productId))),
      commitments,
    };
  }

  /** El PDF de la ficha en su versión para el cliente, sin las columnas internas. */
  async pdfForAccount(externalId: string): Promise<{ buffer: Buffer; filename: string }> {
    const customer = await this.enabled(externalId);
    const data = await this.catalog.forCustomer(customer.id);
    const buffer = await this.pdf.render(data, { showMargins: false });
    const safeName = data.customerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return { buffer, filename: `catalogo-${safeName}.pdf` };
  }

  /** 404 si la cuenta no está vinculada, la casilla está apagada o el cliente es estándar. */
  private async enabled(externalId: string) {
    const customer = await this.find(externalId);
    if (!customer) throw new NotFoundException('Esta cuenta no tiene catálogo');
    return customer;
  }

  /** La ficha de una cuenta con catálogo, o null (F21·3). */
  customerOf(externalId: string) {
    return this.find(externalId);
  }

  private find(externalId: string) {
    return this.prisma.customer.findFirst({
      where: { externalId, isActive: true, hasPortalAccess: true, type: { in: B2B_TYPES } },
      select: { id: true },
    });
  }

  private async images(productIds: string[]): Promise<Map<string, string>> {
    const members = await this.prisma.webProductMember.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        webProduct: {
          select: { images: { orderBy: { position: 'asc' }, take: 1, select: { path: true } } },
        },
      },
    });
    return new Map(
      members.flatMap((m) => {
        const path = m.webProduct.images[0]?.path;
        return path ? [[m.productId, path]] : [];
      }),
    );
  }

  private async pieces(productIds: string[]): Promise<Map<string, B2bCatalogPiece[]>> {
    const rows = await this.prisma.productPiece.findMany({
      where: { productId: { in: productIds } },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        productId: true,
        name: true,
        defaultFilament: {
          select: {
            children: {
              where: { isActive: true },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, color: true, colorHex: true },
            },
          },
        },
      },
    });
    const byProduct = new Map<string, B2bCatalogPiece[]>();
    for (const row of rows) {
      const children = row.defaultFilament?.children ?? [];
      if (children.length === 0) continue;
      const list = byProduct.get(row.productId) ?? [];
      list.push({
        pieceId: row.id,
        name: row.name,
        colors: children.map((c) => ({ id: c.id, name: c.color ?? c.name, hex: c.colorHex })),
      });
      byProduct.set(row.productId, list);
    }
    return byProduct;
  }

  private async commitments(customerId: string, now: Date): Promise<B2bCommitment[]> {
    const rows = await this.prisma.customerCategoryCommitment.findMany({
      where: { customerId, monthlyCommitmentQty: { not: null } },
      orderBy: { category: { name: 'asc' } },
      select: {
        categoryId: true,
        monthlyCommitmentQty: true,
        isWholesaleSuspended: true,
        category: { select: { name: true } },
      },
    });
    const volumes = await this.prisma.customerMonthlyVolume.findMany({
      where: { customerId, monthStart: startOfBusinessMonth(now) },
      select: { categoryId: true, unitsSold: true },
    });
    const sold = new Map(volumes.map((v) => [v.categoryId, Number(v.unitsSold)]));
    return rows.map((r) => ({
      categoryName: r.category.name,
      committedQty: r.monthlyCommitmentQty!,
      soldQty: sold.get(r.categoryId) ?? 0,
      suspended: r.isWholesaleSuspended,
    }));
  }
}

function toPublic(
  p: CatalogProduct,
  imagePath: string | undefined,
  pieces: B2bCatalogPiece[] | undefined,
): B2bCatalogProduct {
  return {
    productId: p.productId,
    name: p.name,
    sku: p.sku,
    description: p.description,
    categoryName: p.categoryName,
    imagePath: imagePath ?? null,
    // Campo por campo: `markupPct` y `profit` no salen de acá.
    tiers: p.tiers.map((t) => ({
      minQty: t.minQty,
      maxQty: t.maxQty,
      unitPriceCents: toCents(t.finalPrice),
    })),
    basePriceCents: p.basePrice === null ? null : toCents(p.basePrice),
    pieces: pieces ?? [],
  };
}
