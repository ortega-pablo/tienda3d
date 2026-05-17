import { Injectable, NotFoundException } from '@nestjs/common';
import { ChannelKind, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';
import { CategoryTiersService } from '../categories/category-tiers.service';
import { CostingService } from '../costing/costing.service';
import { PricingEngine } from './pricing.engine';
import type { CostingResult } from '../costing/costing.types';
import type {
  ChannelPricingConfig,
  CustomerPricingProfile,
  PriceLine,
  PricingCostInputs,
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

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly engine: PricingEngine,
    private readonly categoryTiers: CategoryTiersService,
  ) {}

  async forProduct(productId: string): Promise<ProductPricesResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, categoryId: true },
    });
    if (!product) throw new NotFoundException('Producto inexistente');

    const cost = await this.costing.forProduct(productId);

    const [productChannels, globals] = await Promise.all([
      this.prisma.productChannel.findMany({
        where: { productId, isEnabled: true },
        include: { channel: true },
      }),
      this.loadGlobals(),
    ]);

    const sorted = [...productChannels].sort(
      (a, b) => a.channel.sortOrder - b.channel.sortOrder,
    );

    const costInputs = {
      fabricationPrice: cost.fabricationPrice,
      otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
    };

    // El "markup base" se resuelve por canal — usamos el resolveMarkup(qty=1)
    // que cae al baseMarkupPct propio o heredado del padre. Si no hay tiers,
    // el motor usa ese markup directamente; si hay tiers, lo guardamos como
    // fallback informativo y la primera tier (minQty=1) pisa lo que el motor
    // realmente aplica.
    const blocks: ChannelPriceBlock[] = await Promise.all(
      sorted
        .filter((pc) => pc.channel.isActive)
        .map(async (pc): Promise<ChannelPriceBlock> => {
          const cfg = this.toConfig(pc.channel);
          const productInputs: ProductPricingInputs = {
            // El targetMarkupPct del motor representa el markup default cuando
            // no se aplica un tier. Lo poblamos con el baseMarkupPct de la
            // categoría para que el motor produzca un precio coherente para
            // qty=1 sin tiers cargadas.
            targetMarkupPct: 0,
            marketplaceCommissionPct: decOrNull(pc.commissionPct),
          };
          const tiersResolution = await this.categoryTiers.list(
            product.categoryId,
            pc.channelId,
          );
          // Para el "base" sin tiers, resolvemos qty=1: lo más representativo
          // de "precio unitario" cuando el catálogo no tiene escala.
          const baseMarkup =
            tiersResolution.tiers.length === 0
              ? await this.resolveBaseMarkup(product.categoryId).catch(() => null)
              : null;
          productInputs.targetMarkupPct = baseMarkup ?? 0;

          const base =
            tiersResolution.tiers.length === 0 && baseMarkup != null
              ? this.engine.price(costInputs, cfg, productInputs, globals)
              : null;

          const tierPrices: ChannelTierPrice[] = tiersResolution.tiers.map((t) => ({
            tierId: t.id,
            minQty: t.minQty,
            maxQty: t.maxQty,
            line: this.engine.price(costInputs, cfg, productInputs, globals, {
              markupPct: t.markupPct,
            }),
          }));

          const needsConfig =
            (base?.missingCommission ?? false) ||
            tierPrices.some((t) => t.line.missingCommission);

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
        }),
    );

    // targetMarkupPct / profitPerUnit a nivel respuesta vienen del baseMarkup
    // de la categoría (con fallback al padre). Si la categoría no tiene base
    // configurada, devolvemos 0 y la UI muestra "—".
    const baseMarkup = await this.resolveBaseMarkup(product.categoryId).catch(() => 0);

    return {
      productId: product.id,
      productName: product.name,
      costWithProvisions: cost.totalCost,
      fabricationPrice: cost.fabricationPrice,
      otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
      totalCost: cost.totalCost,
      profitPerUnit: cost.fabricationPrice * (baseMarkup / 100),
      targetMarkupPct: baseMarkup,
      channels: blocks,
    };
  }

  /**
   * Walk up la cadena padre→hijo para obtener `baseMarkupPct`. Devuelve el
   * primer valor no-null encontrado. Tira si ni la categoría ni el padre lo
   * tienen configurado (caso de error de admin).
   */
  async resolveBaseMarkup(categoryId: string): Promise<number> {
    const cat = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        baseMarkupPct: true,
        parent: { select: { baseMarkupPct: true } },
      },
    });
    if (!cat) throw new NotFoundException(`Categoría ${categoryId} inexistente`);
    if (cat.baseMarkupPct != null) return dec(cat.baseMarkupPct);
    if (cat.parent?.baseMarkupPct != null) return dec(cat.parent.baseMarkupPct);
    throw new NotFoundException(
      `La categoría ${categoryId} no tiene baseMarkupPct (ni propio ni heredado). Configuralo en /categorias/${categoryId}.`,
    );
  }

  /**
   * Recombina los componentes del costo aplicando los flags del cliente que
   * afectan la fabricación (skipMarketing y skipReinvestment). Los flags que
   * solo afectan el motor (skipChannelCommission, skipRegime, customMarkupPct,
   * minTierQty) NO se aplican acá.
   *
   * Si el profile no toca fabricación, devuelve los valores originales.
   */
  applyCustomerCostAdjustments(
    cost: CostingResult,
    profile: CustomerPricingProfile & { skipMarketing?: boolean; skipReinvestment?: boolean },
  ): PricingCostInputs {
    const skipMarketing = profile.skipMarketing === true;
    const skipReinvestment = profile.skipReinvestment === true;

    if (!skipMarketing && !skipReinvestment) {
      return {
        fabricationPrice: cost.fabricationPrice,
        otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
      };
    }

    // process_eff = filament_with_reab + machine + labor_eff + (skipMarketing ? 0 : marketing)
    // fabrication_eff = process_eff × (1 + cont% + (skipReinvestment ? 0 : reinv%))
    const marketing = skipMarketing ? 0 : cost.marketing.perUnit;
    const processEff =
      cost.filament.totalWithReplenishment +
      cost.machine.total +
      cost.labor.total +
      marketing;
    const reinvFraction = skipReinvestment ? 0 : cost.reinvestmentPct / 100;
    const fabricationEff = processEff * (1 + cost.contingencyPct / 100 + reinvFraction);
    return {
      fabricationPrice: fabricationEff,
      otherMaterialsWithReplenishment: cost.materials.totalWithReplenishment,
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
