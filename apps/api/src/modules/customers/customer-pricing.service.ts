import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CategoryTiersService, type CategoryTierDto } from '../categories/category-tiers.service';
import { CostingService } from '../costing/costing.service';
import { PricingEngine } from '../pricing/pricing.engine';
import { PricingService, type ProductPricesResponse } from '../pricing/pricing.service';
import type { ProductPricingInputs } from '../pricing/pricing.types';
import { CustomersService } from './customers.service';

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
function mergeTiersBelowFloor<T extends { minQty: number; maxQty: number | null }>(
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
    private readonly categoryTiers: CategoryTiersService,
  ) {}

  /**
   * Calcula los precios de un producto **para un cliente específico**,
   * aplicando todos los flags y overrides (skipMarketing recompone fabricación;
   * customMarkupPct y minTierQty van al motor; skipChannelCommission/skipRegime
   * forzan los descuentos a 0).
   *
   * Las tiers ahora salen de la categoría del producto (con herencia
   * subcategoría → padre). El `minTierQty` del cliente se aplica por
   * categoría — sigue funcionando porque el commitment vive en
   * `CustomerCategoryCommitment.categoryId`, no en producto.
   */
  async forCustomerProduct(
    customerId: string,
    productId: string,
  ): Promise<ProductPricesResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, categoryId: true },
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

    const [productChannels, globals, baseMarkup] = await Promise.all([
      this.prisma.productChannel.findMany({
        where: { productId, isEnabled: true },
        include: { channel: true },
      }),
      this.pricing.loadGlobals(),
      // baseMarkupPct con fallback al padre. Si está mal configurada la
      // categoría, esto tira NotFoundException — preferible a un 0 silencioso.
      this.pricing.resolveBaseMarkup(product.categoryId).catch(() => 0),
    ]);

    // Cost recombinado según flags de fabricación del cliente.
    const costInputs = this.pricing.applyCustomerCostAdjustments(cost, profile);

    const sorted = [...productChannels].sort(
      (a, b) => a.channel.sortOrder - b.channel.sortOrder,
    );

    const blocks = await Promise.all(
      sorted
        .filter((pc) => pc.channel.isActive)
        .map(async (pc) => {
          const cfg = this.pricing.toConfig(pc.channel);
          const productInputs: ProductPricingInputs = {
            // Cuando la categoría no tiene tier que cubra la qty, el motor
            // usa este targetMarkupPct. customMarkupPct (cliente SPECIAL)
            // pisa esto si está presente; lo respeta el motor solo.
            targetMarkupPct: baseMarkup,
            marketplaceCommissionPct: pc.commissionPct ? Number(pc.commissionPct) : null,
          };

          // Tiers de la categoría para este canal (con herencia padre).
          const tiersResolution = await this.categoryTiers.list(
            product.categoryId,
            pc.channelId,
          );

          // Tier piso del cliente: fusionamos las tiers por debajo del piso
          // con la tier que CONTIENE el piso. Mismo algoritmo de antes, ahora
          // sobre tiers de categoría. Ej: piso=5 sobre [1-4, 5-9, 10-24, 25+]
          // → [1-9, 10-24, 25+].
          const visibleTiers: CategoryTierDto[] = mergeTiersBelowFloor(
            tiersResolution.tiers,
            profile.minTierQty,
          );

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
              { markupPct: t.markupPct },
              profile,
            ),
          }));

          const needsConfig =
            (base?.missingCommission ?? false) ||
            tierLines.some((t) => t.line.missingCommission);

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
            productCommissionPct: pc.commissionPct ? Number(pc.commissionPct) : null,
            base,
            tiers: tierLines,
          };
        }),
    );

    const effectiveMarkup = profile.customMarkupPct ?? baseMarkup;
    return {
      productId: product.id,
      productName: product.name,
      costWithProvisions: costInputs.fabricationPrice + costInputs.otherMaterialsWithReplenishment,
      fabricationPrice: costInputs.fabricationPrice,
      otherMaterialsWithReplenishment: costInputs.otherMaterialsWithReplenishment,
      totalCost: costInputs.fabricationPrice + costInputs.otherMaterialsWithReplenishment,
      profitPerUnit: costInputs.fabricationPrice * (effectiveMarkup / 100),
      targetMarkupPct: effectiveMarkup,
      channels: blocks,
    };
  }
}
