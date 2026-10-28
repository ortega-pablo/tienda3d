import type { INestApplicationContext } from '@nestjs/common';
import { ChannelKind, MaterialType, WebProductStatus } from '@prisma/client';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { AuditService } from '@/modules/audit/audit.service';
import { WebAttributesService } from '@/modules/web-catalog/web-attributes.service';
import { WebCategoriesService } from '@/modules/web-catalog/web-categories.service';
import { WebColorOptionsService } from '@/modules/web-catalog/web-color-options.service';
import { WebImagesService } from '@/modules/web-catalog/web-images.service';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { WebPublicationService } from '@/modules/web-catalog/web-publication.service';
import { WebVariantsService } from '@/modules/web-catalog/web-variants.service';
import { STOREFRONT_MAPPING, type PublicationMapping } from './catalog-mapping';
import { colorKey } from './store-colors';
import {
  planPublication,
  storefrontCatalogSchema,
  variantKey,
  type PlanContext,
  type PublicationPlan,
  type StorefrontCatalog,
} from './storefront-catalog';

export interface ImportOptions {
  /** Carpeta con `catalog.json` y `media/` (la de `storefront/prisma/seed`). */
  from: string;
  /** SKU de la línea de filamento de los colores (F9·1). */
  line: string;
  actorId: string;
  dryRun: boolean;
  log: (line: string) => void;
  /** Tabla de correspondencia; por defecto, la conciliada (catalog-mapping.ts). */
  mapping?: Readonly<Record<string, PublicationMapping>>;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  failed: number;
  hidden: number;
  drafts: number;
  variants: number;
  images: number;
  categories: number;
}

/**
 * Pasa el catálogo de la web al sistema (plan F9·2) con los mismos servicios
 * que usa el panel, así que valen sus reglas, su auditoría y sus precios.
 *
 * Idempotente: una publicación que ya existe (por su slug, actual o viejo) no
 * se toca, y una categoría que ya existe se reusa. Si una publicación falla a
 * mitad de camino se borra entera, para que la próxima corrida la vuelva a
 * crear. Queda oculta si está lista para publicarse y en borrador si no: se
 * muestra en la tienda recién cuando la dueña la publica (F12).
 */
export class StorefrontCatalogImporter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly products: WebProductsService,
    private readonly colorOptions: WebColorOptionsService,
    private readonly attributes: WebAttributesService,
    private readonly variants: WebVariantsService,
    private readonly images: WebImagesService,
    private readonly categories: WebCategoriesService,
    private readonly publication: WebPublicationService,
  ) {}

  static from(app: Pick<INestApplicationContext, 'get'>): StorefrontCatalogImporter {
    return new StorefrontCatalogImporter(
      app.get(PrismaService),
      app.get(AuditService),
      app.get(StorageService),
      app.get(WebProductsService),
      app.get(WebColorOptionsService),
      app.get(WebAttributesService),
      app.get(WebVariantsService),
      app.get(WebImagesService),
      app.get(WebCategoriesService),
      app.get(WebPublicationService),
    );
  }

  async run(opts: ImportOptions): Promise<ImportSummary> {
    const raw: unknown = JSON.parse(await readFile(join(opts.from, 'catalog.json'), 'utf8'));
    const catalog = storefrontCatalogSchema.parse(raw);
    const mapping = opts.mapping ?? STOREFRONT_MAPPING;
    const { ctx, lineId } = await this.context(opts, mapping);
    const summary: ImportSummary = {
      imported: 0,
      skipped: 0,
      failed: 0,
      hidden: 0,
      drafts: 0,
      variants: 0,
      images: 0,
      categories: 0,
    };
    const { log } = opts;
    log(
      `Catálogo de la web: ${catalog.products.length} productos y ${catalog.categories.length} ` +
        `categorías (${catalog.generatedAt})${opts.dryRun ? ' · simulación' : ''}`,
    );

    const categoryIds = await this.ensureCategories(catalog, ctx, opts, summary);

    for (const product of catalog.products) {
      if (await this.alreadyImported(product.slug)) {
        summary.skipped++;
        log(`= ${product.slug}: ya está en el sistema, no se toca`);
        continue;
      }
      const result = planPublication(product, mapping[product.slug], catalog.categories, ctx);
      if (!result.ok) {
        summary.failed++;
        log(`✗ ${product.slug}: ${result.errors.join('; ')}`);
        continue;
      }
      const { plan } = result;
      try {
        const outcome = opts.dryRun
          ? null
          : await this.importOne(plan, {
              lineId,
              categoryIds,
              from: opts.from,
              actorId: opts.actorId,
            });
        summary.imported++;
        summary.variants += plan.variants.length;
        summary.images += plan.images.length;
        if (outcome?.status === WebProductStatus.HIDDEN) summary.hidden++;
        if (outcome?.status === WebProductStatus.DRAFT) summary.drafts++;
        log(
          `+ ${plan.slug}: ${summarize(plan)}${outcome ? ` → ${STATUS_LABEL[outcome.status]}` : ''}`,
        );
        for (const note of plan.notes) log(`    ! ${note}`);
        if (outcome?.missing.length)
          log(`    ! falta para publicar: ${outcome.missing.join('; ')}`);
      } catch (error) {
        summary.failed++;
        log(`✗ ${plan.slug}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const verb = opts.dryRun ? 'se importarían' : 'importadas';
    log(
      `${summary.imported} publicaciones ${verb} (${summary.variants} variantes, ${summary.images} fotos), ` +
        `${summary.skipped} ya estaban, ${summary.failed} con errores; ` +
        `${summary.categories} categorías ${opts.dryRun ? 'a crear' : 'creadas'}.`,
    );
    if (!opts.dryRun) {
      log(`Ocultas y listas para publicar: ${summary.hidden}. En borrador: ${summary.drafts}.`);
    }
    return summary;
  }

  /** Lo que el sistema tiene hoy: productos de la tabla, colores de la línea y fotos. */
  private async context(
    opts: ImportOptions,
    mapping: Readonly<Record<string, PublicationMapping>>,
  ): Promise<{ ctx: PlanContext; lineId: string }> {
    const line = await this.prisma.material.findUnique({
      where: { sku: opts.line },
      include: { children: { where: { isActive: true } } },
    });
    if (!line || line.type !== MaterialType.FILAMENT || line.parentId) {
      throw new Error(`No hay una línea de filamento con SKU ${opts.line}.`);
    }

    const skus = Object.values(mapping).flatMap((m) => m.members.map((x) => x.sku));
    const systemProducts = await this.prisma.product.findMany({
      where: { sku: { in: skus } },
      select: {
        id: true,
        sku: true,
        name: true,
        isActive: true,
        channels: {
          where: { isEnabled: true, channel: { kind: ChannelKind.DIRECT_SALE, isActive: true } },
          select: { id: true },
        },
        webMember: { select: { webProduct: { select: { slug: true } } } },
      },
    });

    let files: string[] = [];
    try {
      files = await readdir(join(opts.from, 'media'));
    } catch {
      // Sin carpeta de fotos: cada foto falta y lo informa el plan.
    }
    return {
      lineId: line.id,
      ctx: {
        products: new Map(
          systemProducts.map((p) => [
            p.sku,
            {
              id: p.id,
              name: p.name,
              isActive: p.isActive,
              directSale: p.channels.length > 0,
              publication: p.webMember?.webProduct.slug ?? null,
            },
          ]),
        ),
        colors: new Map(
          line.children
            .filter((c) => c.color)
            .map((c) => [colorKey(c.color!), { id: c.id, color: c.color! }]),
        ),
        files: new Set(files),
      },
    };
  }

  private async alreadyImported(slug: string): Promise<boolean> {
    const [current, previous] = await Promise.all([
      this.prisma.webProduct.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.webProductSlug.findUnique({ where: { slug }, select: { slug: true } }),
    ]);
    return Boolean(current || previous);
  }

  /** Las categorías de la vidriera: se reusan por slug; las que faltan se crean con su foto. */
  private async ensureCategories(
    catalog: StorefrontCatalog,
    ctx: PlanContext,
    opts: ImportOptions,
    summary: ImportSummary,
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    // Primero las de primer nivel: las hijas necesitan el id del padre.
    const ordered = [...catalog.categories].sort(
      (a, b) => Number(a.parentSlug !== null) - Number(b.parentSlug !== null),
    );
    for (const c of ordered) {
      const existing = await this.prisma.webCategory.findUnique({ where: { slug: c.slug } });
      if (existing) {
        ids.set(c.slug, existing.id);
        continue;
      }
      if (c.image && !ctx.files.has(c.image.file)) {
        throw new Error(`Falta la foto ${c.image.file} de la categoría ${c.slug}.`);
      }
      summary.categories++;
      opts.log(`+ categoría ${c.slug}${c.parentSlug ? ` (dentro de ${c.parentSlug})` : ''}`);
      if (opts.dryRun) continue;
      const parentId = c.parentSlug ? ids.get(c.parentSlug) : null;
      if (c.parentSlug && !parentId) throw new Error(`Categoría ${c.parentSlug} inexistente.`);
      const created = await this.categories.create(
        {
          name: c.name,
          slug: c.slug,
          description: c.description,
          parentId: parentId ?? null,
          sortOrder: c.sortOrder,
        },
        opts.actorId,
      );
      ids.set(c.slug, created.id);
      if (c.image) {
        const buffer = await readFile(join(opts.from, 'media', c.image.file));
        await this.categories.setImage(
          created.id,
          { originalname: c.image.file, buffer },
          opts.actorId,
        );
      }
    }
    return ids;
  }

  private async importOne(
    plan: PublicationPlan,
    env: { lineId: string; categoryIds: Map<string, string>; from: string; actorId: string },
  ): Promise<{ status: WebProductStatus; missing: string[] }> {
    const { actorId } = env;
    const created = await this.products.create(
      {
        name: plan.name,
        slug: plan.slug,
        summary: plan.summary,
        description: plan.description,
        ...(plan.optionLabel ? { optionLabel: plan.optionLabel } : {}),
        members: plan.members.map((m, i) => ({
          productId: m.productId,
          valueLabel: m.valueLabel,
          sortOrder: i,
        })),
      },
      actorId,
    );
    const id = created.id;
    try {
      if (plan.colorOption) {
        await this.colorOptions.set(
          id,
          [
            {
              label: plan.colorOption.label,
              filamentLineId: env.lineId,
              colorIds: plan.colorOption.colorIds,
            },
          ],
          actorId,
        );
      }
      if (plan.attributes.length) await this.attributes.set(id, plan.attributes, actorId);
      if (plan.members.length) await this.variants.regenerate(id, actorId);

      const imageIds = await this.uploadImages(id, plan, env);
      await this.applyVariants(id, plan, imageIds, actorId);
      await this.categories.setProductCategories(
        id,
        plan.categorySlugs.map((slug) => env.categoryIds.get(slug)!),
        actorId,
      );
      return await this.settle(id, actorId);
    } catch (error) {
      await this.discard(id);
      throw error;
    }
  }

  /** Sube la galería en orden; devuelve el id de cada foto por archivo. */
  private async uploadImages(
    id: string,
    plan: PublicationPlan,
    env: { from: string; actorId: string },
  ): Promise<Map<string, string>> {
    const files = await Promise.all(
      plan.images.map(async (image) => ({
        originalname: image.file,
        buffer: await readFile(join(env.from, 'media', image.file)),
      })),
    );
    const product = await this.images.upload(id, files, env.actorId);
    const gallery = [...product.images].sort((a, b) => a.position - b.position);
    const ids = new Map<string, string>();
    for (const [i, image] of plan.images.entries()) {
      const saved = gallery[i]!;
      if (!ids.has(image.file)) ids.set(image.file, saved.id);
      if (image.alt || image.colorId) {
        await this.images.update(
          id,
          saved.id,
          { alt: image.alt, colorMaterialId: image.colorId },
          env.actorId,
        );
      }
    }
    return ids;
  }

  /**
   * Cada variante generada toma la disponibilidad, el stock, la foto y el SKU
   * viejo de su par en la web. Si el sistema generó una combinación que la
   * web no vendía, queda pausada.
   */
  private async applyVariants(
    id: string,
    plan: PublicationPlan,
    imageIds: Map<string, string>,
    actorId: string,
  ): Promise<void> {
    const product = await this.products.get(id);
    const planned = new Map(plan.variants.map((v) => [v.key, v]));
    for (const variant of product.variants) {
      const member = product.members.find((m) => m.id === variant.memberId);
      const key = variantKey({
        member: member?.valueLabel ?? '',
        colorId: variant.options.find((o) => o.kind === 'color')?.valueId ?? null,
        attributes: variant.options
          .filter((o) => o.kind === 'attribute')
          .map((o) => {
            const attribute = product.attributes.find((a) => a.id === o.optionId);
            const value = attribute?.values.find((v) => v.id === o.valueId);
            return { label: attribute?.label ?? '', slug: value?.slug ?? '' };
          }),
      });
      const web = planned.get(key);
      if (!web) {
        await this.variants.update(variant.id, { isActive: false }, actorId);
        continue;
      }
      planned.delete(key);
      await this.variants.update(
        variant.id,
        {
          availability: web.availability,
          stockQuantity: web.stockQuantity,
          maxPerOrder: web.maxPerOrder,
          imageId: web.imageFile ? (imageIds.get(web.imageFile) ?? null) : null,
        },
        actorId,
      );
      if (web.legacySku) {
        await this.prisma.webVariant.update({
          where: { id: variant.id },
          data: { legacySku: web.legacySku },
        });
      }
    }
    if (planned.size) {
      throw new Error(`${planned.size} variante(s) de la web no tienen par en el sistema`);
    }
  }

  /** Oculta si está lista para publicar (sin pasar por la tienda); si no, borrador. */
  private async settle(
    id: string,
    actorId: string,
  ): Promise<{ status: WebProductStatus; missing: string[] }> {
    const checklist = await this.publication.checklist(id);
    if (!checklist.ready) {
      const missing = checklist.checks
        .filter((c) => !c.ok)
        .map((c) => (c.detail ? `${c.label} — ${c.detail}` : c.label));
      return { status: WebProductStatus.DRAFT, missing };
    }
    await this.prisma.webProduct.update({
      where: { id },
      data: { status: WebProductStatus.HIDDEN },
    });
    await this.audit.record({
      actorId,
      entity: 'WebProduct',
      entityId: id,
      action: 'import-storefront',
      before: { status: WebProductStatus.DRAFT },
      after: { status: WebProductStatus.HIDDEN },
    });
    return { status: WebProductStatus.HIDDEN, missing: [] };
  }

  /** Borra una publicación a medio importar, con sus fotos. */
  private async discard(id: string): Promise<void> {
    const images = await this.prisma.webImage.findMany({
      where: { webProductId: id },
      select: { path: true },
    });
    // Las variantes primero: su miembro y sus colores no se borran si las tienen.
    await this.prisma.webVariant.deleteMany({ where: { webProductId: id } });
    await this.prisma.webProduct.delete({ where: { id } });
    await Promise.all(images.map((i) => this.storage.delete('media', i.path)));
  }
}

const STATUS_LABEL: Record<WebProductStatus, string> = {
  DRAFT: 'en borrador',
  PUBLISHED: 'publicada',
  HIDDEN: 'oculta, lista para publicar',
};

function summarize(plan: PublicationPlan): string {
  const parts = [
    plan.members.length
      ? plan.members.map((m) => (m.valueLabel ? `${m.sku} (${m.valueLabel})` : m.sku)).join(' + ')
      : 'sin producto del sistema',
    `${plan.variants.length} variantes`,
    `${plan.images.length} fotos`,
  ];
  if (plan.colorOption) parts.push(`${plan.colorOption.colorIds.length} colores`);
  if (plan.attributes.length) parts.push(plan.attributes.map((a) => a.label).join(', '));
  if (plan.skippedVariants) parts.push(`${plan.skippedVariants} variantes de la web sin importar`);
  return parts.join(' · ');
}
