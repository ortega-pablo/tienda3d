import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface KeychainTierDto {
  id: string;
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  sortOrder: number;
  notes: string | null;
  updatedAt: Date;
}

/**
 * Las tiers de llaveros tienen estructura fija (5 filas seedeadas).
 * Este service solo expone:
 *   - list(): todas las tiers ordenadas por sortOrder.
 *   - updateMarkup(id, markupPct, actorId): edita el markup de una tier.
 *   - findApplicable(qty): resuelve la tier que cubre una cantidad dada.
 *   - assertValidQty(qty): valida que la cantidad respete la grilla
 *     (1..4 libre, ≥5 múltiplo de 5).
 *
 * No expone create ni delete — la estructura es inmutable por diseño.
 */
@Injectable()
export class KeychainTiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<KeychainTierDto[]> {
    const rows = await this.prisma.keychainTier.findMany({
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
  ): Promise<KeychainTierDto[]> {
    if (!Number.isFinite(markupPct) || markupPct < 0) {
      throw new BadRequestException('markupPct debe ser ≥ 0');
    }
    const before = await this.prisma.keychainTier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tier inexistente');
    await this.prisma.keychainTier.update({
      where: { id },
      data: { markupPct },
    });
    await this.audit.record({
      actorId,
      entity: 'KeychainTier',
      entityId: id,
      action: 'update',
      before: { markupPct: Number(before.markupPct) },
      after: { markupPct },
    });
    return this.list();
  }

  /**
   * Resuelve la tier aplicable a una cantidad dada. La cantidad ya debe haber
   * sido validada con `assertValidQty`. Devuelve `null` si ninguna tier la
   * cubre (no debería pasar con la grilla seedeada).
   */
  async findApplicable(qty: number): Promise<KeychainTierDto | null> {
    const all = await this.list();
    return (
      all.find((t) => qty >= t.minQty && (t.maxQty == null || qty <= t.maxQty)) ?? null
    );
  }

  /**
   * Reglas de cantidad válida para llaveros:
   *   - Entero ≥ 1
   *   - Si < 5: cualquiera de 1, 2, 3, 4
   *   - Si ≥ 5: múltiplo de 5 (5, 10, 15, ..., 95, 100, 105, ...)
   */
  assertValidQty(qty: number): void {
    if (!Number.isInteger(qty) || qty < 1) {
      throw new BadRequestException('La cantidad debe ser un entero ≥ 1');
    }
    if (qty >= 5 && qty % 5 !== 0) {
      throw new BadRequestException(
        'Para 5 o más llaveros la cantidad debe ser múltiplo de 5',
      );
    }
  }

  /** Label legible para mostrar en UI y snapshotear en el payload. */
  static tierLabel(tier: { minQty: number; maxQty: number | null }): string {
    if (tier.maxQty == null) return `${tier.minQty}+`;
    if (tier.minQty === tier.maxQty) return `${tier.minQty}`;
    return `${tier.minQty}-${tier.maxQty}`;
  }

  /**
   * Divide los inputs qty-escalables de un payload ADHOC de llaveros por
   * `batchSize`. Usado por `buildItemRow` y `keychainMatrix` para reflejar
   * que los inputs se cargan como totales para un batch de N unidades:
   * el costing computa per-unidad y el motor multiplica por la cantidad
   * cotizada para obtener el lineTotal.
   *
   * Lo que NO se divide:
   *   - `designMinutes`: cargo plano por línea, no escala con qty ni con batch.
   *   - La cantidad de piezas o materiales: solo el VALOR dentro de cada uno.
   *
   * Devuelve un payload nuevo sin mutar el original (para preservar el
   * snapshot que se persiste en `adhocPayload`).
   */
  static divideForBatch<
    T extends {
      pieces: Array<{ grams: number; printMinutes: number }>;
      materials: Array<{ quantity: number }>;
      assemblyMinutes: number;
      managementMinutes: number;
    },
  >(payload: T, batchSize: number): T {
    if (batchSize <= 1) return payload;
    return {
      ...payload,
      pieces: payload.pieces.map((p) => ({
        ...p,
        grams: p.grams / batchSize,
        printMinutes: p.printMinutes / batchSize,
      })),
      materials: payload.materials.map((m) => ({
        ...m,
        quantity: m.quantity / batchSize,
      })),
      assemblyMinutes: payload.assemblyMinutes / batchSize,
      managementMinutes: payload.managementMinutes / batchSize,
    };
  }
}
