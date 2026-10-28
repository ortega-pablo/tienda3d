import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  WebCategoryCreateInput,
  WebCategoryDto,
  WebCategoryUpdateInput,
  WebProductDto,
} from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { toWebImage } from '@/common/storage/images';
import { StorageService } from '@/common/storage/storage.service';
import { AuditService } from '@/modules/audit/audit.service';
import { slugify, WebProductsService } from './web-products.service';

type Tx = Prisma.TransactionClient;

const COUNTS = { _count: { select: { products: true, children: true } } } as const;
type CategoryWithCounts = Prisma.WebCategoryGetPayload<{ include: typeof COUNTS }>;

/**
 * Categorías de la vidriera (plan F5·6): ordenan la tienda sin tocar las
 * categorías de precios del sistema. Dos niveles.
 */
@Injectable()
export class WebCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: WebProductsService,
    private readonly storage: StorageService,
  ) {}

  async list(): Promise<WebCategoryDto[]> {
    const rows = await this.prisma.webCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: COUNTS,
    });
    return rows.map(toDto);
  }

  async create(input: WebCategoryCreateInput, actorId: string): Promise<WebCategoryDto> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw new BadRequestException('El nombre no genera un slug válido: cargalo a mano.');

    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertSlugAvailable(tx, slug);
      if (input.parentId) await this.assertParent(tx, input.parentId);
      return tx.webCategory.create({
        data: {
          name: input.name,
          slug,
          description: input.description ?? '',
          parentId: input.parentId ?? null,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: COUNTS,
      });
    });

    await this.audit.record({
      actorId,
      entity: 'WebCategory',
      entityId: created.id,
      action: 'create',
      after: { ...input, slug },
    });
    return toDto(created);
  }

  async update(
    id: string,
    input: WebCategoryUpdateInput,
    actorId: string,
  ): Promise<WebCategoryDto> {
    const before = await this.prisma.webCategory.findUnique({ where: { id }, include: COUNTS });
    if (!before) throw new NotFoundException('Categoría inexistente');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.slug && input.slug !== before.slug) await this.assertSlugAvailable(tx, input.slug);
      if (input.parentId) {
        if (input.parentId === id) {
          throw new BadRequestException('Una categoría no puede estar dentro de sí misma.');
        }
        if (before._count.children > 0) {
          throw new BadRequestException(
            `"${before.name}" tiene subcategorías: no puede pasar a ser una (solo hay dos niveles).`,
          );
        }
        await this.assertParent(tx, input.parentId);
      }
      return tx.webCategory.update({ where: { id }, data: input, include: COUNTS });
    });

    await this.audit.record({
      actorId,
      entity: 'WebCategory',
      entityId: id,
      action: 'update',
      before: Object.fromEntries(
        Object.keys(input).map((k) => [k, before[k as keyof typeof before]]),
      ),
      after: input,
    });
    return toDto(updated);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const category = await this.prisma.webCategory.findUnique({ where: { id }, include: COUNTS });
    if (!category) throw new NotFoundException('Categoría inexistente');
    if (category._count.children > 0) {
      throw new ConflictException(
        `"${category.name}" tiene ${category._count.children} subcategoría(s): movelas o borralas primero.`,
      );
    }
    if (category._count.products > 0) {
      throw new ConflictException(
        `"${category.name}" tiene ${category._count.products} publicación(es): sacalas primero o desactivá la categoría.`,
      );
    }

    await this.prisma.webCategory.delete({ where: { id } });
    if (category.imagePath) await this.storage.delete('media', category.imagePath);
    await this.audit.record({
      actorId,
      entity: 'WebCategory',
      entityId: id,
      action: 'delete',
      before: { slug: category.slug, name: category.name, parentId: category.parentId },
    });
  }

  /**
   * Foto de la tarjeta de la categoría (plan F6·4). Reemplaza la anterior y
   * borra su archivo una vez guardada la nueva.
   */
  async setImage(
    id: string,
    file: { originalname: string; buffer: Buffer } | undefined,
    actorId: string,
  ): Promise<WebCategoryDto> {
    if (!file) throw new BadRequestException('No llegó ninguna foto.');
    const before = await this.prisma.webCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Categoría inexistente');

    const image = await toWebImage(file.buffer, file.originalname);
    const path = await this.storage.save('media', `categories/${id}`, 'webp', image.data);
    let updated: CategoryWithCounts;
    try {
      updated = await this.prisma.webCategory.update({
        where: { id },
        data: { imagePath: path },
        include: COUNTS,
      });
    } catch (error) {
      await this.storage.delete('media', path);
      throw error;
    }
    if (before.imagePath) await this.storage.delete('media', before.imagePath);

    await this.audit.record({
      actorId,
      entity: 'WebCategory',
      entityId: id,
      action: 'set-image',
      before: { imagePath: before.imagePath },
      after: { imagePath: path, width: image.width, height: image.height },
    });
    return toDto(updated);
  }

  async removeImage(id: string, actorId: string): Promise<WebCategoryDto> {
    const before = await this.prisma.webCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Categoría inexistente');
    const updated = await this.prisma.webCategory.update({
      where: { id },
      data: { imagePath: null },
      include: COUNTS,
    });
    if (before.imagePath) {
      await this.storage.delete('media', before.imagePath);
      await this.audit.record({
        actorId,
        entity: 'WebCategory',
        entityId: id,
        action: 'remove-image',
        before: { imagePath: before.imagePath },
      });
    }
    return toDto(updated);
  }

  /** Reemplaza las categorías de una publicación. */
  async setProductCategories(
    webProductId: string,
    categoryIds: string[],
    actorId: string,
  ): Promise<WebProductDto> {
    const before = await this.products.get(webProductId);
    const ids = [...new Set(categoryIds)];
    const found = await this.prisma.webCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const missing = ids.filter((cid) => !found.some((c) => c.id === cid));
    if (missing.length) {
      throw new BadRequestException(`Categoría inexistente: ${missing.join(', ')}`);
    }

    await this.prisma.$transaction([
      this.prisma.webProductCategory.deleteMany({ where: { webProductId } }),
      this.prisma.webProductCategory.createMany({
        data: ids.map((webCategoryId) => ({ webProductId, webCategoryId })),
      }),
    ]);

    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: webProductId,
      action: 'set-categories',
      before: before.categories.map((c) => c.id),
      after: ids,
    });
    return this.products.get(webProductId);
  }

  // ----- internals -----

  private async assertSlugAvailable(tx: Tx, slug: string) {
    const taken = await tx.webCategory.findUnique({ where: { slug }, select: { id: true } });
    if (taken) throw new ConflictException(`El slug "${slug}" ya lo usa otra categoría.`);
  }

  /** Solo hay dos niveles: la categoría madre tiene que ser de primer nivel. */
  private async assertParent(tx: Tx, parentId: string) {
    const parent = await tx.webCategory.findUnique({
      where: { id: parentId },
      select: { name: true, parentId: true },
    });
    if (!parent) throw new BadRequestException('Categoría madre inexistente.');
    if (parent.parentId) {
      throw new BadRequestException(
        `"${parent.name}" ya es una subcategoría: solo hay dos niveles.`,
      );
    }
  }
}

function toDto(c: CategoryWithCounts): WebCategoryDto {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    parentId: c.parentId,
    imagePath: c.imagePath,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    productCount: c._count.products,
    childCount: c._count.children,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
