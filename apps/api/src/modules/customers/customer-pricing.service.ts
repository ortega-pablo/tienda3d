import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { CostingService } from '../costing/costing.service';
import { PricingEngine } from '../pricing/pricing.engine';
import { PricingService, type ProductPricesResponse } from '../pricing/pricing.service';
import type { ProductPricingInputs } from '../pricing/pricing.types';
import { CustomersService } from './customers.service';

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

        // Tier piso: si el cliente tiene minTierQty, omitimos las tiers que
        // terminan antes del piso (cantidad real < piso → el cliente no
        // accede a esas escalas). La tier que CONTIENE el piso es la primera
        // visible. Si no hay piso, se muestran todas.
        const visibleTiers =
          profile.minTierQty != null
            ? tiers.filter((t) => t.maxQty == null || t.maxQty >= profile.minTierQty!)
            : tiers;
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
