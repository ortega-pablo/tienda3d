import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';

export interface TierDto {
  id: string;
  minQty: number;
  maxQty: number | null;
  /** Markup over cost at this scale; null falls back to the product's targetMarkupPct. */
  markupPct: number | null;
  notes: string | null;
}

export interface TierInput {
  minQty: number;
  maxQty?: number | null;
  markupPct?: number | null;
  notes?: string | null;
}

@Injectable()
export class ProductTiersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(productId: string): Promise<TierDto[]> {
    await this.assertProduct(productId);
    const tiers = await this.prisma.productPriceTier.findMany({
      where: { productId },
      orderBy: { minQty: 'asc' },
    });
    return tiers.map((t) => ({
      id: t.id,
      minQty: t.minQty,
      maxQty: t.maxQty,
      markupPct: decOrNull(t.markupPct),
      notes: t.notes,
    }));
  }

  async create(productId: string, input: TierInput): Promise<TierDto> {
    await this.assertProduct(productId);
    this.assertRange(input);
    await this.assertContiguousAppend(productId, input);
    await this.assertDecreasingMarkup(productId, input);
    const created = await this.prisma.productPriceTier.create({
      data: {
        productId,
        minQty: input.minQty,
        maxQty: input.maxQty ?? null,
        markupPct: input.markupPct ?? null,
        notes: input.notes ?? null,
      },
    });
    return {
      id: created.id,
      minQty: created.minQty,
      maxQty: created.maxQty,
      markupPct: decOrNull(created.markupPct),
      notes: created.notes,
    };
  }

  async update(productId: string, tierId: string, input: Partial<TierInput>): Promise<TierDto> {
    const tier = await this.prisma.productPriceTier.findUnique({ where: { id: tierId } });
    if (!tier || tier.productId !== productId) throw new NotFoundException('Tier inexistente');

    // minQty is determined by chain position. Allowing edits would break the
    // contiguity invariant — to renumber an escala the user has to delete + recreate.
    if (input.minQty !== undefined && input.minQty !== tier.minQty) {
      throw new BadRequestException(
        'minQty está determinado por la posición en la cadena y no se puede modificar',
      );
    }

    // maxQty is only editable on the last escala. Changing a middle one would
    // either leave a hole or overlap its successor, since the successor's
    // minQty was derived from this maxQty at creation time.
    if (input.maxQty !== undefined && (input.maxQty ?? null) !== (tier.maxQty ?? null)) {
      const successor = await this.prisma.productPriceTier.findFirst({
        where: { productId, minQty: { gt: tier.minQty } },
        orderBy: { minQty: 'asc' },
        select: { id: true },
      });
      if (successor) {
        throw new BadRequestException(
          'No se puede cambiar el límite superior de una escala intermedia. Eliminá las escalas posteriores primero.',
        );
      }
      this.assertRange({ minQty: tier.minQty, maxQty: input.maxQty });
    }

    if (input.markupPct !== undefined && input.markupPct !== (tier.markupPct ? Number(tier.markupPct) : null)) {
      await this.assertMarkupAgainstNeighbours(productId, tierId, input.markupPct ?? null);
    }
    const updated = await this.prisma.productPriceTier.update({
      where: { id: tierId },
      data: {
        ...(input.maxQty !== undefined && { maxQty: input.maxQty }),
        ...(input.markupPct !== undefined && { markupPct: input.markupPct }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
    return {
      id: updated.id,
      minQty: updated.minQty,
      maxQty: updated.maxQty,
      markupPct: decOrNull(updated.markupPct),
      notes: updated.notes,
    };
  }

  async remove(productId: string, tierId: string): Promise<void> {
    const tier = await this.prisma.productPriceTier.findUnique({ where: { id: tierId } });
    if (!tier || tier.productId !== productId) throw new NotFoundException('Tier inexistente');

    // Only the last tier (highest minQty) can be deleted — otherwise the
    // remaining tiers would leave an uncovered gap, which the contiguity
    // rule on create explicitly forbids.
    const last = await this.prisma.productPriceTier.findFirst({
      where: { productId },
      orderBy: { minQty: 'desc' },
    });
    if (last && last.id !== tierId) {
      throw new BadRequestException(
        'Solo se puede eliminar la última escala. Borrá las posteriores primero para no dejar huecos.',
      );
    }
    await this.prisma.productPriceTier.delete({ where: { id: tierId } });
  }

  /** Returns the tier covering the requested quantity for a product. */
  async findApplicable(
    productId: string,
    quantity: number,
  ): Promise<{ id: string; minQty: number; maxQty: number | null; markupPct: number | null } | null> {
    const tiers = await this.prisma.productPriceTier.findMany({
      where: { productId },
      orderBy: { minQty: 'asc' },
    });
    const match = tiers.find(
      (t) => quantity >= t.minQty && (t.maxQty == null || quantity <= t.maxQty),
    );
    if (!match) return null;
    return {
      id: match.id,
      minQty: match.minQty,
      maxQty: match.maxQty,
      markupPct: match.markupPct ? dec(match.markupPct) : null,
    };
  }

  // ----- internals -----

  private async assertProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto inexistente');
  }

  private assertRange(input: { minQty: number; maxQty?: number | null }): void {
    if (input.minQty < 1) throw new BadRequestException('minQty debe ser ≥ 1');
    if (input.maxQty !== null && input.maxQty !== undefined && input.maxQty < input.minQty) {
      throw new BadRequestException('maxQty debe ser ≥ minQty');
    }
  }

  /**
   * Tiers must form a contiguous chain starting at 1 with no gaps and no
   * overlaps. The first tier must start at 1; each subsequent tier must
   * start at the previous tier's maxQty + 1. If the previous tier is
   * open-ended (maxQty = null), no further tiers can be appended.
   */
  private async assertContiguousAppend(productId: string, input: TierInput): Promise<void> {
    const last = await this.prisma.productPriceTier.findFirst({
      where: { productId },
      orderBy: { minQty: 'desc' },
    });
    if (!last) {
      if (input.minQty !== 1) {
        throw new BadRequestException('La primera escala debe arrancar en 1 unidad');
      }
      return;
    }
    if (last.maxQty == null) {
      throw new ConflictException(
        'La última escala ya cubre hasta infinito. Editá su límite superior antes de agregar otra.',
      );
    }
    const expected = last.maxQty + 1;
    if (input.minQty !== expected) {
      throw new BadRequestException(
        `La nueva escala debe arrancar en ${expected} para continuar la cobertura sin huecos`,
      );
    }
  }

  /**
   * The new tier's effective markup must be strictly lower than the
   * previous tier's effective markup. "Effective" means the explicit
   * markup if set, otherwise the product's targetMarkupPct. The first
   * tier has no constraint — any value (including null) is allowed.
   */
  private async assertDecreasingMarkup(productId: string, input: TierInput): Promise<void> {
    const last = await this.prisma.productPriceTier.findFirst({
      where: { productId },
      orderBy: { minQty: 'desc' },
    });
    if (!last) return;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { targetMarkupPct: true },
    });
    const fallback = product ? dec(product.targetMarkupPct) : 0;
    const prev = last.markupPct != null ? dec(last.markupPct) : fallback;
    const next = input.markupPct != null ? input.markupPct : fallback;

    if (next >= prev) {
      throw new BadRequestException(
        `El markup de la nueva escala (${next}%) debe ser menor al de la escala anterior (${prev}%)`,
      );
    }
  }

  /**
   * On update, the edited tier's effective markup must remain strictly
   * lower than its predecessor's and strictly higher than its successor's
   * (if any), so the decreasing-markup invariant holds across the chain.
   */
  private async assertMarkupAgainstNeighbours(
    productId: string,
    tierId: string,
    nextMarkup: number | null,
  ): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { targetMarkupPct: true },
    });
    const fallback = product ? dec(product.targetMarkupPct) : 0;
    const effective = nextMarkup != null ? nextMarkup : fallback;

    const tiers = await this.prisma.productPriceTier.findMany({
      where: { productId },
      orderBy: { minQty: 'asc' },
    });
    const idx = tiers.findIndex((t) => t.id === tierId);
    if (idx === -1) return;

    const prev = idx > 0 ? tiers[idx - 1] : null;
    const succ = idx < tiers.length - 1 ? tiers[idx + 1] : null;

    if (prev) {
      const prevEff = prev.markupPct != null ? dec(prev.markupPct) : fallback;
      if (effective >= prevEff) {
        throw new BadRequestException(
          `El markup (${effective}%) debe ser menor al de la escala anterior (${prevEff}%)`,
        );
      }
    }
    if (succ) {
      const succEff = succ.markupPct != null ? dec(succ.markupPct) : fallback;
      if (effective <= succEff) {
        throw new BadRequestException(
          `El markup (${effective}%) debe ser mayor al de la escala siguiente (${succEff}%)`,
        );
      }
    }
  }
}
