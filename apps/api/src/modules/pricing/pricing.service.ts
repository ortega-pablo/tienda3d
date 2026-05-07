import { Injectable, NotFoundException } from '@nestjs/common';
import { ChannelKind, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';
import { CostingService } from '../costing/costing.service';
import { PricingEngine } from './pricing.engine';
import type {
  ChannelPricingConfig,
  PriceLine,
  PricingGlobals,
  ProductPricingInputs,
} from './pricing.types';

export interface ChannelTierPrice {
  tierId: string | null;
  minQty: number;
  maxQty: number | null;
  line: PriceLine;
}

export interface ChannelPriceBlock {
  channelId: string;
  channelName: string;
  channelSlug: string;
  channelKind: ChannelKind;
  icon: string | null;
  taxMode: 'SIMPLE' | 'DETAILED';
  withInvoiceDefault: boolean;
  enabled: boolean;
  needsConfig: boolean;
  productCommissionPct: number | null;
  base: PriceLine | null;
  tiers: ChannelTierPrice[];
}

export interface ProductPricesResponse {
  productId: string;
  productName: string;
  /** @deprecated alias de totalCost (Logic B). */
  costWithProvisions: number;
  /** Logic C v3 — precio de fabricación, base del profit. */
  fabricationPrice: number;
  /** Σ otros insumos con reab — se suman post-profit. */
  otherMaterialsWithReplenishment: number;
  /** Costo total: fabricationPrice + otherMaterialsWithReplenishment. */
  totalCost: number;
  /**
   * Ganancia de bolsillo por unidad (Logic C v3): profit absoluto fijo entre
   * canales. Se calcula como `fabricationPrice × targetMarkupPct%`.
   */
  profitPerUnit: number;
  targetMarkupPct: number;
  channels: ChannelPriceBlock[];
}

export interface PricingForProductOptions {
  withoutRegime?: boolean;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly engine: PricingEngine,
  ) {}

  async forProduct(
    productId: string,
    options: PricingForProductOptions = {},
  ): Promise<ProductPricesResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, targetMarkupPct: true },
    });
    if (!product) throw new NotFoundException('Producto inexistente');

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
      this.loadGlobals(),
    ]);

    // Tiers are now product-wide; the same scale applies to every channel.
    const sorted = [...productChannels].sort(
      (a, b) => a.channel.sortOrder - b.channel.sortOrder,
    );

    const costInputs = {
      fabricationPrice: cost.fabricationPrice,
      otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
    };

    const blocks: ChannelPriceBlock[] = sorted
      .filter((pc) => pc.channel.isActive)
      .map((pc) => {
        const cfg = this.toConfig(pc.channel);
        const productInputs: ProductPricingInputs = {
          targetMarkupPct,
          marketplaceCommissionPct: decOrNull(pc.commissionPct),
        };

        const base =
          tiers.length === 0
            ? this.engine.price(
                costInputs,
                cfg,
                productInputs,
                globals,
                {},
                { withoutRegime: options.withoutRegime },
              )
            : null;

        const tierPrices: ChannelTierPrice[] = tiers.map((t) => ({
          tierId: t.id,
          minQty: t.minQty,
          maxQty: t.maxQty,
          line: this.engine.price(
            costInputs,
            cfg,
            productInputs,
            globals,
            { markupPct: t.markupPct ? dec(t.markupPct) : undefined },
            { withoutRegime: options.withoutRegime },
          ),
        }));

        const needsConfig =
          (base?.missingCommission ?? false) || tierPrices.some((t) => t.line.missingCommission);

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
          productCommissionPct: decOrNull(pc.commissionPct),
          base,
          tiers: tierPrices,
        };
      });

    return {
      productId: product.id,
      productName: product.name,
      costWithProvisions: cost.totalCost,
      fabricationPrice: cost.fabricationPrice,
      otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
      totalCost: cost.totalCost,
      profitPerUnit: cost.fabricationPrice * (targetMarkupPct / 100),
      targetMarkupPct,
      channels: blocks,
    };
  }

  async loadGlobals(): Promise<PricingGlobals> {
    const params = await this.prisma.globalParam.findMany({
      where: { key: { in: ['direct_sale_commission_pct', 'unified_regime_pct'] } },
    });
    const map = new Map(params.map((p) => [p.key, Number(p.value)]));
    return {
      directSaleCommissionPct: map.get('direct_sale_commission_pct') ?? 0,
      unifiedRegimePct: map.get('unified_regime_pct') ?? 0,
    };
  }

  toConfig(c: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    kind: ChannelKind;
    taxMode: 'SIMPLE' | 'DETAILED';
    commissionPct: Prisma.Decimal;
    withInvoiceDefault: boolean;
    unifiedRegimePct: Prisma.Decimal | null;
    iibbPct: Prisma.Decimal | null;
    appliesIva: boolean;
    defaultInvoiceType: 'A' | 'B' | 'C' | 'X';
    retentionIvaPct: Prisma.Decimal | null;
    retentionIibbPct: Prisma.Decimal | null;
    retentionIncomePct: Prisma.Decimal | null;
  }): ChannelPricingConfig {
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      kind: c.kind,
      taxMode: c.taxMode,
      commissionPct: dec(c.commissionPct),
      withInvoiceDefault: c.withInvoiceDefault,
      unifiedRegimePct: decOrNull(c.unifiedRegimePct),
      iibbPct: decOrNull(c.iibbPct),
      appliesIva: c.appliesIva,
      defaultInvoiceType: c.defaultInvoiceType,
      retentionIvaPct: decOrNull(c.retentionIvaPct),
      retentionIibbPct: decOrNull(c.retentionIibbPct),
      retentionIncomePct: decOrNull(c.retentionIncomePct),
    };
  }
}
