import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  WebProductDto,
  WebVariantsRegenerateResultDto,
  WebVariantUpdateInput,
} from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { variantMatrix, type MatrixCombination } from './domain/variant-matrix';
import { nextVariantSkus, planVariants } from './domain/variant-plan';
import { WebProductsService } from './web-products.service';

type Tx = Prisma.TransactionClient;

/** Tope de combinaciones por publicación: más que eso es un error de carga. */
export const MAX_VARIANTS = 200;

/**
 * Variantes de una publicación (plan F5·5): cada combinación vendible con su
 * SKU, su disponibilidad y su stock (D9, D15).
 */
@Injectable()
export class WebVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: WebProductsService,
  ) {}

  /**
   * Arma la matriz con los miembros y las opciones activas y la aplica:
   * conserva, crea y desactiva. Nunca borra una variante ni cambia un SKU.
   */
  async regenerate(webProductId: string, actorId: string): Promise<WebVariantsRegenerateResultDto> {
    await this.products.get(webProductId);

    const plan = await this.prisma
      .$transaction(async (tx) => {
        const wanted = await this.matrix(tx, webProductId);
        if (wanted.length > MAX_VARIANTS) {
          throw new BadRequestException(
            `La publicación daría ${wanted.length} variantes (máximo ${MAX_VARIANTS}): sacá colores o valores.`,
          );
        }
        const existing = await tx.webVariant.findMany({
          where: { webProductId },
          select: { id: true, selectionKey: true, isActive: true, pausedByAdmin: true },
        });
        const plan = planVariants(wanted, existing);

        if (plan.deactivate.length) {
          await tx.webVariant.updateMany({
            where: { id: { in: plan.deactivate } },
            data: { isActive: false },
          });
        }
        if (plan.reactivate.length) {
          await tx.webVariant.updateMany({
            where: { id: { in: plan.reactivate } },
            data: { isActive: true },
          });
        }
        await this.create(tx, webProductId, plan.create);
        return plan;
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException(
            'Otra regeneración tomó los mismos SKU al mismo tiempo: volvé a intentar.',
          );
        }
        throw error;
      });

    const counts = {
      created: plan.create.length,
      kept: plan.keep.length,
      reactivated: plan.reactivate.length,
      paused: plan.paused.length,
      deactivated: plan.deactivate.length,
    };
    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: webProductId,
      action: 'regenerate-variants',
      after: counts,
    });
    return { ...counts, product: await this.products.get(webProductId) };
  }

  async update(
    variantId: string,
    input: WebVariantUpdateInput,
    actorId: string,
  ): Promise<WebProductDto> {
    const before = await this.prisma.webVariant.findUnique({ where: { id: variantId } });
    if (!before) throw new NotFoundException('Variante inexistente');

    const data: Prisma.WebVariantUncheckedUpdateInput = { ...input };
    if (input.isActive === true && !before.isActive) {
      const wanted = await this.matrix(this.prisma, before.webProductId);
      if (!wanted.some((c) => c.selectionKey === before.selectionKey)) {
        throw new BadRequestException(
          `${before.sku} ya no es una combinación de la publicación (se quitó su color, valor o miembro).`,
        );
      }
    }
    // Lo que el admin prende o apaga a mano, la regeneración lo respeta.
    if (input.isActive !== undefined) data.pausedByAdmin = !input.isActive;
    if (input.imageId) {
      const image = await this.prisma.webImage.findUnique({
        where: { id: input.imageId },
        select: { webProductId: true },
      });
      if (image?.webProductId !== before.webProductId) {
        throw new BadRequestException('La foto no es de esta publicación.');
      }
    }

    await this.prisma.webVariant.update({ where: { id: variantId }, data });
    await this.audit.record({
      actorId,
      entity: 'WebVariant',
      entityId: variantId,
      action: 'update',
      before: Object.fromEntries(
        Object.keys(input).map((k) => [k, before[k as keyof typeof before]]),
      ),
      after: input,
    });
    return this.products.get(before.webProductId);
  }

  // ----- internals -----

  /** Combinaciones de los miembros y las opciones activas, con colores activos en Insumos. */
  private async matrix(tx: Tx, webProductId: string): Promise<MatrixCombination[]> {
    const product = await tx.webProduct.findUniqueOrThrow({
      where: { id: webProductId },
      select: {
        members: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, productId: true },
        },
        colorOptions: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            values: {
              where: { material: { isActive: true } },
              orderBy: { sortOrder: 'asc' },
              select: { materialId: true },
            },
            pieces: { select: { piece: { select: { productId: true } } } },
          },
        },
        attributes: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            values: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: { id: true },
            },
          },
        },
      },
    });
    return variantMatrix({
      members: product.members,
      colorOptions: product.colorOptions.map((o) => ({
        id: o.id,
        values: o.values.map((v) => v.materialId),
        productIds: [...new Set(o.pieces.map((p) => p.piece.productId))],
      })),
      attributes: product.attributes.map((a) => ({
        id: a.id,
        values: a.values.map((v) => v.id),
      })),
    });
  }

  /** Crea las combinaciones nuevas con el SKU siguiente de cada miembro. */
  private async create(tx: Tx, webProductId: string, combos: MatrixCombination[]) {
    const byMember = new Map<string, MatrixCombination[]>();
    for (const combo of combos) {
      byMember.set(combo.memberId, [...(byMember.get(combo.memberId) ?? []), combo]);
    }

    for (const [memberId, memberCombos] of byMember) {
      const member = await tx.webProductMember.findUniqueOrThrow({
        where: { id: memberId },
        select: { product: { select: { sku: true } } },
      });
      const prefix = `${member.product.sku}-V`;
      const taken = await tx.webVariant.findMany({
        where: { sku: { startsWith: prefix } },
        select: { sku: true },
      });
      const skus = nextVariantSkus(
        member.product.sku,
        taken.map((v) => v.sku),
        memberCombos.length,
      );

      for (const [i, combo] of memberCombos.entries()) {
        await tx.webVariant.create({
          data: {
            webProductId,
            memberId,
            sku: skus[i]!,
            selectionKey: combo.selectionKey,
            selections: {
              create: combo.selections.map((s) =>
                s.kind === 'color'
                  ? { colorOptionId: s.optionId, materialId: s.materialId }
                  : { attributeValueId: s.valueId },
              ),
            },
          },
        });
      }
    }
  }
}
