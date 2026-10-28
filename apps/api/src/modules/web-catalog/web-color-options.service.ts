import { BadRequestException, Injectable } from '@nestjs/common';
import { MaterialType, Prisma } from '@prisma/client';
import type { WebColorOptionInput, WebProductDto } from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { WebProductsService } from './web-products.service';

type Tx = Prisma.TransactionClient;

interface ResolvedOption {
  id?: string;
  label: string;
  filamentLineId: string;
  colorIds: string[];
  pieceIds: string[];
}

/**
 * Opciones de color de una publicación (plan F5·3, T8): de la línea de
 * filamento con la que se imprimen sus piezas, la tienda ofrece solo los
 * colores elegidos (2 aunque se pueda imprimir en 5).
 */
@Injectable()
export class WebColorOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: WebProductsService,
  ) {}

  async set(
    webProductId: string,
    options: WebColorOptionInput[],
    actorId: string,
  ): Promise<WebProductDto> {
    const before = await this.products.get(webProductId);

    await this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolve(tx, webProductId, options);
      await this.replace(tx, webProductId, resolved);
    });

    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: webProductId,
      action: 'set-color-options',
      before: before.colorOptions.map((o) => ({
        id: o.id,
        label: o.label,
        filamentLineId: o.filamentLineId,
        colorIds: o.values.map((v) => v.materialId),
        pieceIds: o.pieces.map((p) => p.id),
        isActive: o.isActive,
      })),
      after: options,
    });
    return this.products.get(webProductId);
  }

  // ----- internals -----

  /**
   * Valida cada opción contra los miembros activos de la publicación y completa
   * las piezas que no vinieron.
   */
  private async resolve(
    tx: Tx,
    webProductId: string,
    options: WebColorOptionInput[],
  ): Promise<ResolvedOption[]> {
    const ids = options.flatMap((o) => (o.id ? [o.id] : []));
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Una opción de color aparece dos veces.');
    }
    const own = await tx.webColorOption.findMany({
      where: { webProductId, id: { in: ids } },
      select: { id: true },
    });
    const foreign = ids.filter((id) => !own.some((o) => o.id === id));
    if (foreign.length) {
      throw new BadRequestException(
        `Opción de color inexistente en esta publicación: ${foreign.join(', ')}`,
      );
    }

    // Piezas de los miembros activos, con la línea con la que se imprimen. Una
    // pieza que apunta a un color (dato viejo) se imprime con la línea de ese color.
    const pieces = await tx.productPiece.findMany({
      where: { product: { webMember: { is: { webProductId, isActive: true } } } },
      orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        defaultFilament: { select: { id: true, parentId: true } },
      },
    });
    const lineOfPiece = new Map(
      pieces.map((p) => [p.id, p.defaultFilament?.parentId ?? p.defaultFilament?.id ?? null]),
    );
    const pieceName = new Map(pieces.map((p) => [p.id, p.name]));

    const materialIds = [...new Set(options.flatMap((o) => [o.filamentLineId, ...o.colorIds]))];
    const materials = await tx.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, name: true, type: true, parentId: true, isActive: true },
    });
    const material = new Map(materials.map((m) => [m.id, m]));

    const taken = new Map<string, string>();
    return options.map((option) => {
      const line = material.get(option.filamentLineId);
      if (!line || line.type !== MaterialType.FILAMENT || line.parentId !== null) {
        throw new BadRequestException(
          `"${option.label}": ${line ? `"${line.name}"` : 'el insumo elegido'} no es una línea de filamento.`,
        );
      }

      if (new Set(option.colorIds).size !== option.colorIds.length) {
        throw new BadRequestException(`"${option.label}" repite un color.`);
      }
      for (const colorId of option.colorIds) {
        const color = material.get(colorId);
        if (!color) throw new BadRequestException(`Color inexistente: ${colorId}`);
        if (color.parentId !== line.id) {
          throw new BadRequestException(
            `El color "${color.name}" no es de la línea "${line.name}".`,
          );
        }
        if (!color.isActive) {
          throw new BadRequestException(
            `El color "${color.name}" está inactivo en Insumos: no se puede ofrecer.`,
          );
        }
      }

      let pieceIds = option.pieceIds && [...new Set(option.pieceIds)];
      if (pieceIds) {
        for (const pieceId of pieceIds) {
          if (!lineOfPiece.has(pieceId)) {
            throw new BadRequestException(
              `"${option.label}": la pieza ${pieceId} no es de un producto de esta publicación.`,
            );
          }
          if (lineOfPiece.get(pieceId) !== line.id) {
            throw new BadRequestException(
              `La pieza "${pieceName.get(pieceId)}" no se imprime con "${line.name}".`,
            );
          }
        }
      } else {
        pieceIds = pieces.filter((p) => lineOfPiece.get(p.id) === line.id).map((p) => p.id);
        if (pieceIds.length === 0) {
          throw new BadRequestException(
            `Ninguna pieza de la publicación se imprime con "${line.name}".`,
          );
        }
      }

      // Una pieza toma un solo color.
      for (const pieceId of pieceIds) {
        const other = taken.get(pieceId);
        if (other !== undefined) {
          throw new BadRequestException(
            `La pieza "${pieceName.get(pieceId)}" está en "${other}" y en "${option.label}": elegí las piezas de cada opción.`,
          );
        }
        taken.set(pieceId, option.label);
      }

      return {
        id: option.id,
        label: option.label,
        filamentLineId: line.id,
        colorIds: option.colorIds,
        pieceIds,
      };
    });
  }

  /**
   * Reemplaza las opciones. La que ya no viene se borra, salvo que tenga
   * variantes: ahí queda inactiva con ellas. Un color que sale de una opción
   * deja sin venta a las variantes que lo usan.
   */
  private async replace(tx: Tx, webProductId: string, options: ResolvedOption[]) {
    const current = await tx.webColorOption.findMany({
      where: { webProductId },
      include: { values: true, _count: { select: { selections: true } } },
    });
    const keptIds = new Set(options.flatMap((o) => (o.id ? [o.id] : [])));

    for (const option of current.filter((o) => !keptIds.has(o.id))) {
      if (option._count.selections > 0) {
        await tx.webColorOption.update({ where: { id: option.id }, data: { isActive: false } });
        await tx.webVariant.updateMany({
          where: { selections: { some: { colorOptionId: option.id } } },
          data: { isActive: false },
        });
      } else {
        await tx.webColorOption.delete({ where: { id: option.id } });
      }
    }

    for (const [index, option] of options.entries()) {
      const data = {
        label: option.label,
        filamentLineId: option.filamentLineId,
        sortOrder: index,
        isActive: true,
      };
      const saved = option.id
        ? await tx.webColorOption.update({ where: { id: option.id }, data })
        : await tx.webColorOption.create({ data: { webProductId, ...data } });

      const removed = (current.find((o) => o.id === saved.id)?.values ?? [])
        .map((v) => v.materialId)
        .filter((id) => !option.colorIds.includes(id));
      if (removed.length) {
        await tx.webVariant.updateMany({
          where: {
            selections: { some: { colorOptionId: saved.id, materialId: { in: removed } } },
          },
          data: { isActive: false },
        });
      }

      await tx.webColorValue.deleteMany({ where: { optionId: saved.id } });
      await tx.webColorValue.createMany({
        data: option.colorIds.map((materialId, sortOrder) => ({
          optionId: saved.id,
          materialId,
          sortOrder,
        })),
      });
      await tx.webColorOptionPiece.deleteMany({ where: { optionId: saved.id } });
      await tx.webColorOptionPiece.createMany({
        data: option.pieceIds.map((pieceId) => ({ optionId: saved.id, pieceId })),
      });
    }
  }
}
