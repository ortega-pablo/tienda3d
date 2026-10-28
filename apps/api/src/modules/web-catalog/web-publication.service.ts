import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, WebPriceState, WebProductStatus } from '@prisma/client';
import type { WebProductDto, WebPublishChecklistDto } from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogEvents } from './catalog-events';
import { WebProductsService } from './web-products.service';

type Tx = Prisma.TransactionClient;

/**
 * El botón de la ficha (plan F5·7): `DRAFT → PUBLISHED ↔ HIDDEN`. Antes de
 * publicar se revisa que la publicación se pueda vender.
 */
@Injectable()
export class WebPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: WebProductsService,
    private readonly events: CatalogEvents,
  ) {}

  async checklist(webProductId: string): Promise<WebPublishChecklistDto> {
    return this.check(this.prisma, webProductId);
  }

  async publish(webProductId: string, actorId: string): Promise<WebProductDto> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const product = await this.find(tx, webProductId);
      if (product.status === WebProductStatus.PUBLISHED) return null;

      const checklist = await this.check(tx, webProductId);
      if (!checklist.ready) {
        const missing = checklist.checks.filter((c) => !c.ok).map((c) => c.label);
        throw new UnprocessableEntityException({
          message: `Falta para publicar: ${missing.join('; ')}.`,
          missing,
        });
      }

      await tx.webProduct.update({
        where: { id: webProductId },
        data: {
          status: WebProductStatus.PUBLISHED,
          // La primera publicación queda como fecha de alta en la tienda.
          ...(product.publishedAt ? {} : { publishedAt: new Date() }),
        },
      });
      await this.events.changed(tx, { scope: 'product', ids: [product.slug] });
      return product;
    });

    if (changed) {
      await this.audit.record({
        actorId,
        entity: 'WebProduct',
        entityId: webProductId,
        action: 'publish',
        before: { status: changed.status },
        after: { status: WebProductStatus.PUBLISHED },
      });
    }
    return this.products.get(webProductId);
  }

  async hide(webProductId: string, actorId: string): Promise<WebProductDto> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const product = await this.find(tx, webProductId);
      if (product.status === WebProductStatus.HIDDEN) return null;
      if (product.status === WebProductStatus.DRAFT) {
        throw new BadRequestException('La publicación nunca se publicó: no hay nada que ocultar.');
      }
      await tx.webProduct.update({
        where: { id: webProductId },
        data: { status: WebProductStatus.HIDDEN },
      });
      await this.events.changed(tx, { scope: 'product', ids: [product.slug] });
      return product;
    });

    if (changed) {
      await this.audit.record({
        actorId,
        entity: 'WebProduct',
        entityId: webProductId,
        action: 'hide',
        before: { status: changed.status },
        after: { status: WebProductStatus.HIDDEN },
      });
    }
    return this.products.get(webProductId);
  }

  // ----- internals -----

  private async find(tx: Tx, webProductId: string) {
    const product = await tx.webProduct.findUnique({
      where: { id: webProductId },
      select: { slug: true, status: true, publishedAt: true },
    });
    if (!product) throw new NotFoundException('Publicación inexistente');
    return product;
  }

  private async check(tx: Tx, webProductId: string): Promise<WebPublishChecklistDto> {
    const product = await tx.webProduct.findUnique({
      where: { id: webProductId },
      select: {
        slug: true,
        description: true,
        _count: { select: { images: true } },
      },
    });
    if (!product) throw new NotFoundException('Publicación inexistente');

    // Una variante se vende si está activa, su producto del sistema también,
    // tiene precio calculado y ninguno de sus colores está inactivo en Insumos.
    const sellable = await tx.webVariant.count({
      where: {
        webProductId,
        isActive: true,
        member: {
          isActive: true,
          product: { isActive: true, webPrice: { is: { state: WebPriceState.OK } } },
        },
        selections: { none: { material: { isActive: false } } },
      },
    });

    const checks: WebPublishChecklistDto['checks'] = [
      { key: 'slug', ok: product.slug.length > 0, label: 'Tiene una dirección (slug)' },
      {
        key: 'description',
        ok: product.description.trim().length > 0,
        label: 'Tiene descripción',
      },
      { key: 'image', ok: product._count.images > 0, label: 'Tiene al menos una foto' },
      {
        key: 'variant',
        ok: sellable > 0,
        label: 'Tiene al menos una variante activa con precio',
      },
    ];
    return { ready: checks.every((c) => c.ok), checks };
  }
}
