import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WebAttributeInput, WebProductDto } from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { slugify, WebProductsService } from './web-products.service';

type Tx = Prisma.TransactionClient;

interface ResolvedValue {
  id?: string;
  slug: string;
  label: string;
}

interface ResolvedAttribute {
  id?: string;
  label: string;
  values: ResolvedValue[];
}

/**
 * Opciones informativas de una publicación (plan F5·4, D6): "Tipo de hoja:
 * Cuadro/Punto" sin un producto del sistema por cada valor. Generan variantes,
 * todas con el precio de su miembro.
 */
@Injectable()
export class WebAttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: WebProductsService,
  ) {}

  async set(
    webProductId: string,
    attributes: WebAttributeInput[],
    actorId: string,
  ): Promise<WebProductDto> {
    const before = await this.products.get(webProductId);

    await this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolve(tx, webProductId, attributes);
      await this.replace(tx, webProductId, resolved);
    });

    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: webProductId,
      action: 'set-attributes',
      before: before.attributes.map((a) => ({
        id: a.id,
        label: a.label,
        isActive: a.isActive,
        values: a.values.map((v) => ({
          id: v.id,
          slug: v.slug,
          label: v.label,
          isActive: v.isActive,
        })),
      })),
      after: attributes,
    });
    return this.products.get(webProductId);
  }

  // ----- internals -----

  private async resolve(
    tx: Tx,
    webProductId: string,
    attributes: WebAttributeInput[],
  ): Promise<ResolvedAttribute[]> {
    const current = await tx.webAttribute.findMany({
      where: { webProductId },
      include: { values: { select: { id: true } } },
    });

    assertUnique(
      attributes.flatMap((a) => (a.id ? [a.id] : [])),
      () => 'Una opción informativa aparece dos veces.',
    );
    assertUnique(
      attributes.map((a) => a.label.toLowerCase()),
      (label) => `Hay dos opciones informativas que se llaman "${label}".`,
    );

    return attributes.map((attribute) => {
      const own = attribute.id ? current.find((a) => a.id === attribute.id) : undefined;
      if (attribute.id && !own) {
        throw new BadRequestException(
          `Opción informativa inexistente en esta publicación: ${attribute.id}`,
        );
      }

      const values = attribute.values.map((value) => {
        if (value.id && !own?.values.some((v) => v.id === value.id)) {
          throw new BadRequestException(
            `"${attribute.label}": el valor ${value.id} es de otra opción.`,
          );
        }
        const slug = value.slug ?? slugify(value.label);
        if (!slug) {
          throw new BadRequestException(
            `"${attribute.label}": "${value.label}" no genera un slug válido, cargalo a mano.`,
          );
        }
        return { id: value.id, slug, label: value.label };
      });
      assertUnique(
        values.map((v) => v.slug),
        (slug) => `"${attribute.label}" repite el valor "${slug}".`,
      );
      assertUnique(
        values.map((v) => v.label.toLowerCase()),
        (label) => `"${attribute.label}" repite el valor "${label}".`,
      );

      return { id: attribute.id, label: attribute.label, values };
    });
  }

  /**
   * Reemplaza las opciones y sus valores. Lo que ya no viene se borra, salvo
   * que tenga variantes: ahí queda inactivo y sus variantes dejan de venderse.
   */
  private async replace(tx: Tx, webProductId: string, attributes: ResolvedAttribute[]) {
    const current = await tx.webAttribute.findMany({
      where: { webProductId },
      include: { values: { include: { _count: { select: { selections: true } } } } },
    });
    const keptIds = new Set(attributes.flatMap((a) => (a.id ? [a.id] : [])));

    for (const attribute of current.filter((a) => !keptIds.has(a.id))) {
      const used = attribute.values.filter((v) => v._count.selections > 0);
      if (used.length === 0) {
        await tx.webAttribute.delete({ where: { id: attribute.id } });
        continue;
      }
      await tx.webAttribute.update({ where: { id: attribute.id }, data: { isActive: false } });
      await this.retireValues(
        tx,
        attribute.values.map((v) => ({ id: v.id, used: v._count.selections > 0 })),
      );
    }

    for (const [index, attribute] of attributes.entries()) {
      const data = { label: attribute.label, sortOrder: index, isActive: true };
      const saved = attribute.id
        ? await tx.webAttribute.update({ where: { id: attribute.id }, data })
        : await tx.webAttribute.create({ data: { webProductId, ...data } });
      const existing = current.find((a) => a.id === saved.id)?.values ?? [];

      // Cada valor que llega se asocia al existente por id o, si no, por slug
      // (sin tomar uno que otro valor trae por id).
      const explicitIds = new Set(attribute.values.flatMap((v) => (v.id ? [v.id] : [])));
      const matched = attribute.values.map((value) => ({
        ...value,
        id: value.id ?? existing.find((v) => v.slug === value.slug && !explicitIds.has(v.id))?.id,
      }));
      const matchedIds = new Set(matched.flatMap((v) => (v.id ? [v.id] : [])));
      const retired = existing.filter((v) => !matchedIds.has(v.id));

      // Un valor con variantes conserva su slug aunque quede inactivo.
      for (const value of matched) {
        const clash = retired.find((r) => r.slug === value.slug && r._count.selections > 0);
        if (clash) {
          throw new BadRequestException(
            `"${attribute.label}": "${value.slug}" fue un valor con variantes; reactivalo en vez de crear otro.`,
          );
        }
      }
      await this.retireValues(
        tx,
        retired.map((v) => ({ id: v.id, used: v._count.selections > 0 })),
      );

      // Slugs temporales para que un intercambio (a↔b) no choque con el índice único.
      const renamed = matched.filter(
        (v) => v.id && existing.find((e) => e.id === v.id)?.slug !== v.slug,
      );
      for (const value of renamed) {
        await tx.webAttributeValue.update({
          where: { id: value.id },
          data: { slug: `__${value.id}` },
        });
      }
      for (const [sortOrder, value] of matched.entries()) {
        const valueData = { slug: value.slug, label: value.label, sortOrder, isActive: true };
        if (value.id) {
          await tx.webAttributeValue.update({ where: { id: value.id }, data: valueData });
        } else {
          await tx.webAttributeValue.create({ data: { attributeId: saved.id, ...valueData } });
        }
      }
    }
  }

  private async retireValues(tx: Tx, values: Array<{ id: string; used: boolean }>) {
    const used = values.filter((v) => v.used).map((v) => v.id);
    const unused = values.filter((v) => !v.used).map((v) => v.id);
    if (unused.length) await tx.webAttributeValue.deleteMany({ where: { id: { in: unused } } });
    if (used.length) {
      await tx.webAttributeValue.updateMany({
        where: { id: { in: used } },
        data: { isActive: false },
      });
      await tx.webVariant.updateMany({
        where: { selections: { some: { attributeValueId: { in: used } } } },
        data: { isActive: false },
      });
    }
  }
}

function assertUnique(items: string[], message: (item: string) => string) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) throw new BadRequestException(message(item));
    seen.add(item);
  }
}
