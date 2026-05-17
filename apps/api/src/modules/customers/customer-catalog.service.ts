import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { CustomerPricingService } from './customer-pricing.service';
import { CustomersService } from './customers.service';

export interface CatalogTier {
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  finalPrice: number;
  profit: number;
}

export interface CatalogProduct {
  productId: string;
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  categoryName: string | null;
  /**
   * Línea de precios para el canal default del cliente (o el primer canal
   * activo del producto si no hay default).
   */
  channelName: string | null;
  tiers: CatalogTier[];
  /** Precio "base" si no hay tiers definidas. */
  basePrice: number | null;
  baseProfit: number | null;
}

export interface CustomerCatalog {
  customerId: string;
  customerName: string;
  customerType: CustomerType;
  channelName: string | null;
  generatedAt: string;
  products: CatalogProduct[];
}

@Injectable()
export class CustomerCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly customerPricing: CustomerPricingService,
  ) {}

  /**
   * Arma el catálogo completo del cliente con precios calculados para el
   * canal default. Pensado para enviar como PDF antes de tener portal.
   */
  async forCustomer(customerId: string): Promise<CustomerCatalog> {
    const customer = await this.customers.getWithRelations(customerId);
    if (!customer.isActive) {
      throw new ForbiddenException('El cliente está inactivo');
    }

    // Listo todos los productos activos y filtro por canBuy.
    const allProducts = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        sku: true,
        description: true,
        imageUrl: true,
        categoryId: true,
        category: { select: { name: true, parentId: true } },
      },
    });

    const eligible: typeof allProducts = [];
    for (const p of allProducts) {
      const ok = await this.customers.canBuy(customerId, p.id);
      if (ok) eligible.push(p);
    }

    // El catálogo se arma siempre contra Venta Directa (canal default del
    // flujo simplificado, decisión 2026-05-16). Si el cliente quiere ver
    // precios "sin factura" (Efectivo), se cambia desde el filtro del
    // catálogo en runtime (no es relevante para el PDF).
    const ventaDirecta = await this.prisma.channel.findFirst({
      where: { slug: 'directa', isActive: true },
      select: { id: true, name: true },
    });
    const channelName: string | null = ventaDirecta?.name ?? null;

    // Para cada producto, calculamos sus precios y filtramos al canal Venta
    // Directa. Si el producto no lo tiene habilitado, caemos al primer canal
    // con precio razonable (típicamente Efectivo).
    const products: CatalogProduct[] = [];
    for (const p of eligible) {
      try {
        const prices = await this.customerPricing.forCustomerProduct(customerId, p.id);
        const candidate =
          prices.channels.find(
            (c) => ventaDirecta && c.channelId === ventaDirecta.id,
          ) ??
          prices.channels.find((c) => !c.needsConfig && (c.base != null || c.tiers.length > 0)) ??
          null;

        if (!candidate) {
          products.push({
            productId: p.id,
            name: p.name,
            sku: p.sku,
            description: p.description,
            imageUrl: p.imageUrl,
            categoryName: p.category?.name ?? null,
            channelName: null,
            tiers: [],
            basePrice: null,
            baseProfit: null,
          });
          continue;
        }

        const tiers: CatalogTier[] = candidate.tiers.map((t) => ({
          minQty: t.minQty,
          maxQty: t.maxQty,
          markupPct: t.line.markupPct,
          finalPrice: t.line.finalPrice,
          profit: t.line.profit,
        }));

        products.push({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          description: p.description,
          imageUrl: p.imageUrl,
          categoryName: p.category?.name ?? null,
          channelName: candidate.channelName,
          tiers,
          basePrice: candidate.base?.finalPrice ?? null,
          baseProfit: candidate.base?.profit ?? null,
        });
      } catch {
        // Si falla el cálculo de un producto puntual (ej. data inconsistente),
        // lo skipeamos sin bloquear todo el catálogo.
        continue;
      }
    }

    return {
      customerId: customer.id,
      customerName: customer.name,
      customerType: customer.type,
      channelName,
      generatedAt: new Date().toISOString(),
      products,
    };
  }
}

// Para evitar warnings de imports.
void NotFoundException;
void dec;
