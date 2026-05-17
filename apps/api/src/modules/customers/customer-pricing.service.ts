import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { CostingService } from '../costing/costing.service';
import { PricingEngine } from '../pricing/pricing.engine';
import { PricingService, type ProductPricesResponse } from '../pricing/pricing.service';
import type { ProductPricingInputs } from '../pricing/pricing.types';
import { CustomersService } from './customers.service';

type PriceTier = {
  id: string;
  productId: string;
  minQty: number;
  maxQty: number | null;
  markupPct: unknown;
  notes: string | null;
};

/**
 * Fusiona las tiers que quedan por debajo del piso del cliente con la tier
 * que CONTIENE el piso, en una sola tier "extendida".
 *
 * Ejemplo: tiers [1-4, 5-9, 10-24, 25+] con piso=5 → [1-9, 10-24, 25+].
 * La nueva tier conserva el `markupPct` y `maxQty` de la tier piso, y toma
 * el `minQty` de la primera tier original (típicamente 1). Las tiers por
 * encima del piso se mantienen sin cambios.
 *
 * Si el piso es null o no cae dentro de ninguna tier, devuelve las tiers
 * originales sin tocar.
 */
function mergeTiersBelowFloor<T extends PriceTier>(
  tiers: T[],
  floor: number | null | undefined,
): T[] {
  if (floor == null) return tiers;
  const first = tiers[0];
  if (!first) return tiers;

  const floorIdx = tiers.findIndex(
    (t) => t.minQty <= floor && (t.maxQty == null || t.maxQty >= floor),
  );
  if (floorIdx <= 0) return tiers;

  const floorTier = tiers[floorIdx]!;
  const merged = { ...floorTier, minQty: first.minQty } as T;
  return [merged, ...tiers.slice(floorIdx + 1)];
}

@Injectable()
export class CustomerPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly costing: CostingService,
    private readonly pricing: PricingService,
    private readonly engine: PricingEngine,
  ) {}

  /**
   * Calcula los precios de un producto **para un cliente específico**,
   * aplicando todos los flags y overrides (skipMarketing recompone fabricación;
   * customMarkupPct y minTierQty van al motor; skipChannelCommission/skipRegime
   * forzan los descuentos a 0).
   */
  async forCustomerProduct(
    customerId: string,
    productId: string,
  ): Promise<ProductPricesResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, targetMarkupPct: true },
    });
    if (!product) throw new NotFoundException('Producto inexistente');

    const canBuy = await this.customers.canBuy(customerId, productId);
    if (!canBuy) {
      throw new ForbiddenException(
        'El cliente no tiene acceso a este producto (catálogo restringido).',
      );
    }

    const profile = await this.customers.resolveProductProfile(customerId, productId);

    const cost = await this.costing.forProduct(productId);
    const targetMarkupPct = dec(product.targetMarkupPct);

    const [productChannels, tiers, globals] = await Promise.all([
      this.prisma.productChannel.findMany({
        where: { productId, isEnabled: true },
        include: { channel: true },
      }),
      this.prisma.productPriceTier.findMany({
        where: { productId },
        orderBy: { minQty: 'asc' },
      }),
      this.pricing.loadGlobals(),
    ]);

    // Cost recombinado según flags de fabricación del cliente.
    const costInputs = this.pricing.applyCustomerCostAdjustments(cost, profile);

    const sorted = [...productChannels].sort(
      (a, b) => a.channel.sortOrder - b.channel.sortOrder,
    );

    const blocks = sorted
      .filter((pc) => pc.channel.isActive)
      .map((pc) => {
        const cfg = this.pricing.toConfig(pc.channel);
        const productInputs: ProductPricingInputs = {
          targetMarkupPct,
          marketplaceCommissionPct: pc.commissionPct ? dec(pc.commissionPct) : null,
        };

        // Tier piso: si el cliente tiene minTierQty, fusionamos las tiers que
        // van desde la primera hasta la que CONTIENE el piso en una sola
        // tier "extendida" cuyo rango arranca en el minQty original (típico
        // 1) y termina en el maxQty de la tier piso, con el markup de la
        // tier piso. Así el cliente ve, por ejemplo, "1-9" en lugar de
        // "1-4 + 5-9" cuando su piso es 5.
        const visibleTiers = mergeTiersBelowFloor(tiers, profile.minTierQty);
        const base =
          visibleTiers.length === 0
            ? this.engine.price(costInputs, cfg, productInputs, globals, {}, profile)
            : null;

        const tierLines = visibleTiers.map((t) => ({
          tierId: t.id,
          minQty: t.minQty,
          maxQty: t.maxQty,
          line: this.engine.price(
            costInputs,
            cfg,
            productInputs,
            globals,
            { markupPct: t.markupPct ? dec(t.markupPct) : undefined },
            profile,
          ),
        }));

        const needsConfig =
          (base?.missingCommission ?? false) || tierLines.some((t) => t.line.missingCommission);

        return {
          channelId: pc.channelId,
          channelName: pc.channel.name,
          channelSlug: pc.channel.slug,
          channelKind: pc.channel.kind,
          icon: pc.channel.icon,
          taxMode: pc.channel.taxMode,
          withInvoiceDefault: pc.channel.withInvoiceDefault,
          enabled: true,
          needsConfig,
          productCommissionPct: pc.commissionPct ? dec(pc.commissionPct) : null,
          base,
          tiers: tierLines,
        };
      });

    return {
      productId: product.id,
      productName: product.name,
      costWithProvisions: costInputs.fabricationPrice + costInputs.otherMaterialsWithReplenishment,
      fabricationPrice: costInputs.fabricationPrice,
      otherMaterialsWithReplenishment: costInputs.otherMaterialsWithReplenishment,
      totalCost: costInputs.fabricationPrice + costInputs.otherMaterialsWithReplenishment,
      profitPerUnit:
        costInputs.fabricationPrice * ((profile.customMarkupPct ?? targetMarkupPct) / 100),
      targetMarkupPct: profile.customMarkupPct ?? targetMarkupPct,
      channels: blocks,
    };
  }

}
