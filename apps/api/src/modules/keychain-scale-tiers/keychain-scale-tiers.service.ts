import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PieceScope } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface KeychainScaleTierDto {
  id: string;
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  sortOrder: number;
  notes: string | null;
  updatedAt: Date;
}

/**
 * Grilla GLOBAL de escalas de markup para productos de catálogo tipo llavero
 * (`Product.kind = KEYCHAIN`). Estructura fija de 5 filas CONTIGUAS
 * (1-4 / 5-24 / 25-49 / 50-99 / 100+): cubren cualquier cantidad entera ≥ 1 sin
 * huecos, a diferencia de `KeychainTier` (flujo ADHOC, con huecos por múltiplos
 * de 5).
 *
 * La escala 1-4 (primera fila) se cotiza con la base de piezas INDIVIDUAL; el
 * resto con la base de piezas BATCH ÷ `keychain_batch_size`. `pickScope(qty)`
 * resuelve cuál corresponde a partir de la propia grilla (no hardcodea el 5).
 *
 * Expone solo list / updateMarkup / findApplicable / pickScope — la estructura
 * es inmutable por diseño (sin create ni delete).
 */
@Injectable()
export class KeychainScaleTiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lectura pura: NUNCA valida ni tira. Un estado inconsistente en DB no debe
   * dejar la pantalla de parámetros (ni el pricing de los llaveros) inutilizable
   * — la validación vive en la escritura, que es donde se puede prevenir.
   */
  async list(): Promise<KeychainScaleTierDto[]> {
    const rows = await this.prisma.keychainScaleTier.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      minQty: r.minQty,
      maxQty: r.maxQty,
      markupPct: Number(r.markupPct),
      sortOrder: r.sortOrder,
      notes: r.notes,
      updatedAt: r.updatedAt,
    }));
  }

  async updateMarkup(
    id: string,
    markupPct: number,
    actorId: string,
  ): Promise<KeychainScaleTierDto[]> {
    if (!Number.isFinite(markupPct) || markupPct < 0) {
      throw new BadRequestException('markupPct debe ser ≥ 0');
    }
    const before = await this.prisma.keychainScaleTier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Escala inexistente');

    // Validamos la grilla RESULTANTE antes de escribir: si el cambio la deja
    // inconsistente, rechazamos sin tocar la DB (nada de estados corruptos).
    const prospective = (await this.list()).map((t) =>
      t.id === id ? { ...t, markupPct } : t,
    );
    KeychainScaleTiersService.assertValidGrid(prospective);

    await this.prisma.keychainScaleTier.update({
      where: { id },
      data: { markupPct },
    });
    await this.audit.record({
      actorId,
      entity: 'KeychainScaleTier',
      entityId: id,
      action: 'update',
      before: { markupPct: Number(before.markupPct) },
      after: { markupPct },
    });
    return this.list();
  }

  /**
   * Resuelve la escala aplicable a una cantidad dada. Como la grilla es
   * contigua, siempre resuelve una fila para cualquier entero ≥ 1.
   */
  async findApplicable(qty: number): Promise<KeychainScaleTierDto | null> {
    const all = await this.list();
    return KeychainScaleTiersService.resolveApplicable(all, qty);
  }

  /**
   * Scope de piezas que corresponde a una cantidad: la primera escala usa la
   * base INDIVIDUAL; el resto la base BATCH (tanda). El umbral se deriva de la
   * grilla (maxQty de la primera fila), no se hardcodea.
   */
  async pickScope(qty: number): Promise<PieceScope> {
    const all = await this.list();
    return KeychainScaleTiersService.resolveScope(all, qty);
  }

  // ----- helpers puros (testeables sin DB) -----

  static resolveApplicable(
    tiers: Array<{ minQty: number; maxQty: number | null }>,
    qty: number,
  ): KeychainScaleTierDto | null {
    return (
      (tiers as KeychainScaleTierDto[]).find(
        (t) => qty >= t.minQty && (t.maxQty == null || qty <= t.maxQty),
      ) ?? null
    );
  }

  static resolveScope(
    tiers: Array<{ minQty: number; maxQty: number | null }>,
    qty: number,
  ): PieceScope {
    const first = tiers[0];
    if (first && first.maxQty != null && qty <= first.maxQty) {
      return PieceScope.INDIVIDUAL;
    }
    return PieceScope.BATCH;
  }

  /** Label legible para UI y snapshot ("1-4", "100+"). */
  static tierLabel(tier: { minQty: number; maxQty: number | null }): string {
    if (tier.maxQty == null) return `${tier.minQty}+`;
    if (tier.minQty === tier.maxQty) return `${tier.minQty}`;
    return `${tier.minQty}-${tier.maxQty}`;
  }

  /**
   * Invariantes de la grilla (se validan al leer). Espeja `validateTierSet` de
   * las tiers por categoría:
   *   1. La primera fila arranca en minQty = 1.
   *   2. Cadena contigua sin huecos: cada fila arranca en prev.maxQty + 1.
   *   3. Solo la última fila puede ser abierta (maxQty = null).
   *   4. Markups no crecientes al subir la cantidad. Dos escalas contiguas
   *      pueden compartir markup (decisión de negocio válida: sin descuento
   *      adicional entre esos tramos); lo que se rechaza es que SUBA, porque
   *      cobrar más markup por comprar más no tiene sentido comercial.
   */
  static assertValidGrid(
    tiers: Array<{ minQty: number; maxQty: number | null; markupPct: number }>,
  ): void {
    if (tiers.length === 0) {
      throw new BadRequestException('La grilla de escalas de llavero está vacía. Reejecutá el seed.');
    }
    if (tiers[0]!.minQty !== 1) {
      throw new BadRequestException('La primera escala de llavero debe arrancar en minQty = 1.');
    }
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i]!;
      const isLast = i === tiers.length - 1;
      if (!isLast && t.maxQty == null) {
        throw new BadRequestException('Solo la última escala de llavero puede ser abierta (maxQty = null).');
      }
      if (i > 0) {
        const prev = tiers[i - 1]!;
        if (prev.maxQty == null || t.minQty !== prev.maxQty + 1) {
          throw new BadRequestException(
            `La grilla de escalas de llavero tiene un hueco entre ${prev.maxQty ?? '∞'} y ${t.minQty}.`,
          );
        }
        if (t.markupPct > prev.markupPct) {
          throw new BadRequestException(
            `El markup de la escala ${KeychainScaleTiersService.tierLabel(t)} (${t.markupPct}%) no puede ser mayor al de la escala anterior ${KeychainScaleTiersService.tierLabel(prev)} (${prev.markupPct}%): a mayor cantidad, el markup no puede subir.`,
          );
        }
      }
    }
  }
}
