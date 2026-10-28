import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelKind, Prisma } from '@prisma/client';
import type {
  WebProductCreateInput,
  WebProductDto,
  WebProductMemberInput,
  WebProductSummaryDto,
  WebProductUpdateInput,
} from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';

const DETAIL_INCLUDE = {
  members: {
    orderBy: { sortOrder: 'asc' },
    include: { product: { select: { name: true, sku: true } } },
  },
  colorOptions: {
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    include: {
      filamentLine: { select: { name: true } },
      values: {
        orderBy: { sortOrder: 'asc' },
        include: {
          material: { select: { name: true, color: true, colorHex: true, isActive: true } },
        },
      },
      pieces: {
        orderBy: { piece: { sortOrder: 'asc' } },
        include: {
          piece: { select: { name: true, productId: true, product: { select: { name: true } } } },
        },
      },
    },
  },
  slugHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.WebProductInclude;

type WebProductWithDetail = Prisma.WebProductGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type Tx = Prisma.TransactionClient;

/**
 * Publicaciones de la tienda online (plan F5·2): lo que el cliente ve como un
 * producto, agrupando uno o más productos del sistema como variantes.
 */
@Injectable()
export class WebProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<WebProductSummaryDto[]> {
    const rows = await this.prisma.webProduct.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { members: true, variants: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      memberCount: p._count.members,
      variantCount: p._count.variants,
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async get(id: string): Promise<WebProductDto> {
    const product = await this.prisma.webProduct.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!product) throw new NotFoundException('Publicación inexistente');
    return toDto(product);
  }

  async create(input: WebProductCreateInput, actorId: string): Promise<WebProductDto> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw new BadRequestException('El nombre no genera un slug válido: cargalo a mano.');

    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertSlugAvailable(tx, slug);
      const product = await tx.webProduct.create({
        data: {
          name: input.name,
          slug,
          summary: input.summary ?? '',
          description: input.description ?? '',
          ...(input.optionLabel ? { optionLabel: input.optionLabel } : {}),
        },
      });
      if (input.members?.length) await this.replaceMembers(tx, product.id, input.members);
      return product;
    });

    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: created.id,
      action: 'create',
      after: { slug, name: input.name, members: input.members ?? [] },
    });
    return this.get(created.id);
  }

  async update(id: string, input: WebProductUpdateInput, actorId: string): Promise<WebProductDto> {
    const before = await this.prisma.webProduct.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Publicación inexistente');

    await this.prisma.$transaction(async (tx) => {
      if (input.slug && input.slug !== before.slug) {
        await this.assertSlugAvailable(tx, input.slug, id);
        // El slug viejo queda reservado para que el sitio redirija (F12·4). Si
        // se vuelve a un slug anterior, deja de figurar como viejo.
        await tx.webProductSlug.upsert({
          where: { slug: before.slug },
          create: { slug: before.slug, webProductId: id },
          update: {},
        });
        await tx.webProductSlug.deleteMany({ where: { slug: input.slug, webProductId: id } });
      }
      await tx.webProduct.update({ where: { id }, data: input });
    });

    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: id,
      action: 'update',
      before: pick(before, Object.keys(input)),
      after: input,
    });
    return this.get(id);
  }

  async setMembers(
    id: string,
    members: WebProductMemberInput[],
    actorId: string,
  ): Promise<WebProductDto> {
    const exists = await this.prisma.webProduct.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Publicación inexistente');

    const before = await this.prisma.webProductMember.findMany({ where: { webProductId: id } });
    await this.prisma.$transaction((tx) => this.replaceMembers(tx, id, members));

    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: id,
      action: 'set-members',
      before: before.map((m) => ({
        productId: m.productId,
        valueLabel: m.valueLabel,
        isActive: m.isActive,
      })),
      after: members,
    });
    return this.get(id);
  }

  // ----- internals -----

  /**
   * Reemplaza los miembros de la publicación. Los que ya no vienen se borran,
   * salvo que tengan variantes: ahí quedan inactivos (y sus variantes también),
   * porque una variante pudo haberse vendido.
   */
  private async replaceMembers(tx: Tx, webProductId: string, members: WebProductMemberInput[]) {
    const ids = members.map((m) => m.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Un producto del sistema aparece dos veces en la publicación.');
    }
    await this.assertProductsPublishable(tx, webProductId, ids);

    const current = await tx.webProductMember.findMany({
      where: { webProductId },
      include: { _count: { select: { variants: true } } },
    });
    for (const member of current.filter((m) => !ids.includes(m.productId))) {
      // Sus piezas dejan de tomar el color de las opciones de la publicación.
      await tx.webColorOptionPiece.deleteMany({
        where: { option: { webProductId }, piece: { productId: member.productId } },
      });
      if (member._count.variants > 0) {
        await tx.webProductMember.update({ where: { id: member.id }, data: { isActive: false } });
        await tx.webVariant.updateMany({
          where: { memberId: member.id },
          data: { isActive: false },
        });
      } else {
        await tx.webProductMember.delete({ where: { id: member.id } });
      }
    }
    for (const [index, member] of members.entries()) {
      const data = {
        valueLabel: member.valueLabel,
        sortOrder: member.sortOrder ?? index,
        isActive: true,
      };
      await tx.webProductMember.upsert({
        where: { productId: member.productId },
        create: { webProductId, productId: member.productId, ...data },
        update: data,
      });
    }
  }

  /**
   * Un producto del sistema entra a la tienda si existe, está activo, tiene
   * Venta Directa habilitada (de ahí sale su precio, T5) y no está en otra
   * publicación (D14).
   */
  private async assertProductsPublishable(tx: Tx, webProductId: string, productIds: string[]) {
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        isActive: true,
        webMember: { select: { webProductId: true, webProduct: { select: { name: true } } } },
        channels: {
          where: { isEnabled: true, channel: { kind: ChannelKind.DIRECT_SALE, isActive: true } },
          select: { id: true },
        },
      },
    });
    const missing = productIds.filter((pid) => !products.some((p) => p.id === pid));
    if (missing.length)
      throw new NotFoundException(`Producto del sistema inexistente: ${missing.join(', ')}`);

    for (const p of products) {
      if (!p.isActive) {
        throw new BadRequestException(`"${p.name}" está archivado: no se puede publicar.`);
      }
      if (p.channels.length === 0) {
        throw new BadRequestException(
          `"${p.name}" no tiene Venta Directa habilitada: el precio web sale de ese canal.`,
        );
      }
      if (p.webMember && p.webMember.webProductId !== webProductId) {
        throw new ConflictException(
          `"${p.name}" ya está en la publicación "${p.webMember.webProduct.name}": un producto del sistema va en una sola.`,
        );
      }
    }
  }

  /** Un slug sirve si no es el de otra publicación ni un slug viejo de otra (redirige). */
  private async assertSlugAvailable(tx: Tx, slug: string, ownId?: string) {
    const [current, previous] = await Promise.all([
      tx.webProduct.findUnique({ where: { slug }, select: { id: true } }),
      tx.webProductSlug.findUnique({ where: { slug }, select: { webProductId: true } }),
    ]);
    if ((current && current.id !== ownId) || (previous && previous.webProductId !== ownId)) {
      throw new ConflictException(`El slug "${slug}" ya lo usa otra publicación de la tienda.`);
    }
  }
}

function toDto(p: WebProductWithDetail): WebProductDto {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    summary: p.summary,
    description: p.description,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    optionLabel: p.optionLabel,
    status: p.status,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    featured: p.featured,
    sortOrder: p.sortOrder,
    members: p.members.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product.name,
      productSku: m.product.sku,
      valueLabel: m.valueLabel,
      sortOrder: m.sortOrder,
      isActive: m.isActive,
    })),
    colorOptions: p.colorOptions.map((o) => ({
      id: o.id,
      label: o.label,
      filamentLineId: o.filamentLineId,
      filamentLineName: o.filamentLine.name,
      sortOrder: o.sortOrder,
      isActive: o.isActive,
      values: o.values.map((v) => ({
        materialId: v.materialId,
        name: v.material.name,
        color: v.material.color,
        colorHex: v.material.colorHex,
        isActive: v.material.isActive,
        sortOrder: v.sortOrder,
      })),
      pieces: o.pieces.map((op) => ({
        id: op.pieceId,
        name: op.piece.name,
        productId: op.piece.productId,
        productName: op.piece.product.name,
      })),
    })),
    previousSlugs: p.slugHistory.map((s) => s.slug),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function pick<T extends object>(obj: T, keys: string[]): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k))) as Partial<T>;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
