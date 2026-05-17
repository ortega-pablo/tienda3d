import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';

export interface CategoryTierDto {
  id: string;
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  notes: string | null;
}

export interface CategoryTierInput {
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  notes?: string | null;
}

export interface CategoryTiersResolution {
  tiers: CategoryTierDto[];
  /** De qué nivel vienen los tiers efectivos. */
  source: 'own' | 'inherited' | 'none';
  /** Si source = 'inherited', el id de la categoría padre que los aportó. */
  inheritedFromCategoryId: string | null;
}

export interface MarkupResolution {
  /** Markup efectivo a aplicar (en %). */
  markupPct: number;
  /**
   * De dónde sale el markup:
   *   - 'tier'        : tier propia de la categoría cubre la cantidad.
   *   - 'parent-tier' : la subcategoría no tenía tiers, hereda del padre.
   *   - 'base'        : ninguna tier cubre la cantidad; cae al baseMarkupPct propio.
   *   - 'parent-base' : ni la categoría ni la subcategoría tienen base; hereda del padre.
   */
  source: 'tier' | 'parent-tier' | 'base' | 'parent-base';
  /** El tier aplicado (si source ∈ tier|parent-tier). */
  tier: CategoryTierDto | null;
  /** Id de la categoría que aportó el valor (puede ser el padre). */
  fromCategoryId: string;
}

/**
 * Service de escalas a nivel categoría/canal — reemplaza a `ProductTiersService`.
 *
 * Modelo de herencia:
 *   - Tiers viven en `(categoryId, channelId)`. Una subcategoría sin tiers
 *     propios para un canal **hereda completas** las del padre (regla
 *     todo-o-nada por canal).
 *   - `Category.baseMarkupPct` es el fallback cuando ninguna tier cubre la
 *     cantidad (típicamente qty=1, antes del primer tier). Si es NULL,
 *     se hereda del padre.
 *
 * Invariantes que `replaceForCategory` valida sobre el set entero:
 *   1. Primera tier arranca en `minQty = 1`.
 *   2. Cadena contigua sin huecos: cada tier siguiente arranca en
 *      `previo.maxQty + 1`.
 *   3. Solo la última tier puede tener `maxQty = null` (abierta).
 *   4. Markups estrictamente decrecientes (a más cantidad, menor markup).
 *
 * Los CRUD incrementales (add/remove tier individual) del modelo anterior
 * desaparecen: el admin edita el set completo y lo guarda atómicamente vía
 * `replaceForCategory`. Esto elimina las complicaciones de "solo borrar la
 * última" o "renumerar minQty" que tenía `ProductTiersService`.
 */
@Injectable()
export class CategoryTiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ----- Lectura -----

  /**
   * Devuelve los tiers efectivos para `(categoryId, channelId)`, marcando si
   * son propios o heredados del padre. La regla todo-o-nada significa que
   * si la categoría tiene aunque sea **una** tier propia para el canal, se
   * usa ese set entero (no se mergea con el del padre).
   */
  async list(categoryId: string, channelId: string): Promise<CategoryTiersResolution> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, parentId: true },
    });
    if (!category) throw new NotFoundException('Categoría inexistente');

    const own = await this.fetchTiers(categoryId, channelId);
    if (own.length > 0) {
      return { tiers: own, source: 'own', inheritedFromCategoryId: null };
    }
    if (category.parentId) {
      const parentTiers = await this.fetchTiers(category.parentId, channelId);
      if (parentTiers.length > 0) {
        return {
          tiers: parentTiers,
          source: 'inherited',
          inheritedFromCategoryId: category.parentId,
        };
      }
    }
    return { tiers: [], source: 'none', inheritedFromCategoryId: null };
  }

  /**
   * Resuelve la tier que cubre `qty` siguiendo la cadena padre→subcategoría.
   * Devuelve null si ninguna tier la cubre (el caller usa `baseMarkupPct`).
   */
  async findApplicable(
    categoryId: string,
    channelId: string,
    qty: number,
  ): Promise<CategoryTierDto | null> {
    const { tiers } = await this.list(categoryId, channelId);
    return tiers.find((t) => qty >= t.minQty && (t.maxQty == null || qty <= t.maxQty)) ?? null;
  }

  /**
   * Resuelve el markup efectivo para `(categoryId, channelId, qty)` con
   * diagnóstico de la fuente. Tira `NotFoundException` solo si no hay tier
   * que cubra ni base propio ni del padre — ese es un error de configuración
   * que el admin debe corregir.
   */
  async resolveMarkup(
    categoryId: string,
    channelId: string,
    qty: number,
  ): Promise<MarkupResolution> {
    const cat = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        baseMarkupPct: true,
        parentId: true,
        parent: { select: { id: true, baseMarkupPct: true } },
      },
    });
    if (!cat) throw new NotFoundException('Categoría inexistente');

    const resolution = await this.list(categoryId, channelId);
    const tier = resolution.tiers.find(
      (t) => qty >= t.minQty && (t.maxQty == null || qty <= t.maxQty),
    );

    if (tier) {
      return {
        markupPct: tier.markupPct,
        source: resolution.source === 'inherited' ? 'parent-tier' : 'tier',
        tier,
        fromCategoryId: resolution.inheritedFromCategoryId ?? categoryId,
      };
    }

    // Fallback al baseMarkupPct propio, o al del padre si el propio es NULL.
    if (cat.baseMarkupPct != null) {
      return {
        markupPct: dec(cat.baseMarkupPct),
        source: 'base',
        tier: null,
        fromCategoryId: cat.id,
      };
    }
    if (cat.parent?.baseMarkupPct != null) {
      return {
        markupPct: dec(cat.parent.baseMarkupPct),
        source: 'parent-base',
        tier: null,
        fromCategoryId: cat.parent.id,
      };
    }
    throw new NotFoundException(
      `La categoría ${cat.id} no tiene tiers para canal ${channelId} ni baseMarkupPct. Configurala en /categorias/${cat.id}.`,
    );
  }

  // ----- Escritura -----

  /**
   * Reemplaza atómicamente el set de tiers de `(categoryId, channelId)` con
   * el array provisto. Valida invariantes del set entero antes de aplicar.
   * Pasar `tiers: []` borra todas las tiers propias y vuelve a heredar del
   * padre.
   */
  async replaceForCategory(
    categoryId: string,
    channelId: string,
    tiers: CategoryTierInput[],
    actorId: string,
  ): Promise<CategoryTierDto[]> {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Categoría inexistente');
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Canal inexistente');

    this.validateTierSet(tiers);

    const before = await this.fetchTiers(categoryId, channelId);

    await this.prisma.$transaction(async (tx) => {
      await tx.categoryPriceTier.deleteMany({
        where: { categoryId, channelId },
      });
      if (tiers.length > 0) {
        await tx.categoryPriceTier.createMany({
          data: tiers.map((t) => ({
            categoryId,
            channelId,
            minQty: t.minQty,
            maxQty: t.maxQty,
            markupPct: new Prisma.Decimal(t.markupPct),
            notes: t.notes ?? null,
          })),
        });
      }
    });

    const after = await this.fetchTiers(categoryId, channelId);
    await this.audit.record({
      actorId,
      entity: 'CategoryPriceTier',
      entityId: `${categoryId}:${channelId}`,
      action: before.length === 0 ? 'create' : tiers.length === 0 ? 'delete' : 'update',
      before: { tiers: before },
      after: { tiers: after },
    });
    return after;
  }

  // ----- Helpers internos -----

  private async fetchTiers(categoryId: string, channelId: string): Promise<CategoryTierDto[]> {
    const rows = await this.prisma.categoryPriceTier.findMany({
      where: { categoryId, channelId },
      orderBy: { minQty: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      minQty: r.minQty,
      maxQty: r.maxQty,
      markupPct: dec(r.markupPct),
      notes: r.notes,
    }));
  }

  /**
   * Valida el set entero antes de persistir. Las reglas reflejan la
   * semántica de escala: arrancar en 1, cubrir sin huecos, terminar en
   * abierta o cerrada, y bajar markup a medida que sube la cantidad.
   */
  private validateTierSet(tiers: CategoryTierInput[]): void {
    if (tiers.length === 0) return; // borrar todo es válido (vuelve a heredar)

    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    if (sorted[0]!.minQty !== 1) {
      throw new BadRequestException('La primera tier debe arrancar en minQty = 1');
    }

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i]!;
      if (t.minQty < 1) {
        throw new BadRequestException(`Tier #${i + 1}: minQty debe ser ≥ 1`);
      }
      if (t.maxQty != null && t.maxQty < t.minQty) {
        throw new BadRequestException(
          `Tier #${i + 1}: maxQty (${t.maxQty}) debe ser ≥ minQty (${t.minQty})`,
        );
      }
      if (t.markupPct < 0) {
        throw new BadRequestException(`Tier #${i + 1}: markupPct debe ser ≥ 0`);
      }
      if (i > 0) {
        const prev = sorted[i - 1]!;
        if (prev.maxQty == null) {
          throw new BadRequestException(
            `Tier #${i + 1}: la tier anterior ya cubre hasta infinito; no puede haber otra después`,
          );
        }
        if (t.minQty !== prev.maxQty + 1) {
          throw new BadRequestException(
            `Tier #${i + 1}: debe arrancar en ${prev.maxQty + 1} para continuar la cobertura sin huecos`,
          );
        }
        if (t.markupPct >= prev.markupPct) {
          throw new BadRequestException(
            `Tier #${i + 1}: el markup (${t.markupPct}%) debe ser menor al de la tier anterior (${prev.markupPct}%)`,
          );
        }
      }
    }
  }
}
