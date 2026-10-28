import { Test, type TestingModule } from '@nestjs/testing';
import { MaterialType, MaterialUnit, WebProductStatus } from '@prisma/client';
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { AppModule } from '@/app.module';
import { WebCategoriesService } from '@/modules/web-catalog/web-categories.service';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';
import type { PublicationMapping } from './catalog-mapping';
import type { StorefrontCatalog } from './storefront-catalog';
import { StorefrontCatalogImporter, type ImportOptions } from './storefront-catalog-importer';

const image = (file: string, alt = '') => ({ file, alt, width: 40, height: 50 });
const variant = (
  options: Record<string, string>,
  rest: Partial<StorefrontCatalog['products'][number]['variants'][number]> = {},
) => ({
  legacyWooId: null,
  sku: null,
  priceCents: 4_000_000,
  compareAtPriceCents: null,
  trackStock: true,
  stockQuantity: 1,
  allowBackorder: false,
  maxPerOrder: null,
  imageFile: null,
  options,
  ...rest,
});
const product = (
  slug: string,
  rest: Partial<StorefrontCatalog['products'][number]>,
): StorefrontCatalog['products'][number] => ({
  legacyWooId: null,
  slug,
  name: slug,
  summary: `Resumen de ${slug}`,
  description: 'Hecha en **Mendoza**.',
  sortOrder: 0,
  categorySlugs: ['lampara', 'lampara-de-mesa'],
  weightGrams: null,
  dimensionsMm: null,
  images: [image('img-tapa.webp')],
  options: [],
  variants: [variant({})],
  ...rest,
});

/** Un catálogo como el de la web: una Trapecio, un cuaderno sin producto y uno fuera de la tabla. */
const CATALOG: StorefrontCatalog = {
  schemaVersion: 1,
  generatedAt: '2026-10-26T20:41:12.232Z',
  source: 'test',
  // La hija primero: el importador crea antes a la madre.
  categories: [
    {
      slug: 'lampara-de-mesa',
      name: 'Lámpara de mesa',
      parentSlug: 'lampara',
      description: '',
      sortOrder: 3,
      image: null,
    },
    {
      slug: 'lampara',
      name: 'Lámpara',
      parentSlug: null,
      description: 'Luz impresa',
      sortOrder: 2,
      image: image('img-cat.webp'),
    },
  ],
  products: [
    product('lampara-trapecio-test', {
      name: 'Lámpara Trapecio — Mesa',
      images: [
        image('img-blanco.webp', 'Trapecio blanca'),
        image('img-negro.webp', 'Trapecio negra'),
        image('img-ambas.webp'),
      ],
      options: [
        {
          slug: 'color',
          name: 'Color',
          values: [
            { slug: 'blanco', label: 'Blanco', colorHex: '#ffffff' },
            { slug: 'negro', label: 'Negro', colorHex: '#000000' },
          ],
        },
        {
          slug: 'tamano',
          name: 'Tamaño',
          values: [
            { slug: '280', label: '280', colorHex: null },
            { slug: '380', label: '380', colorHex: null },
          ],
        },
      ],
      variants: [
        variant(
          { color: 'blanco', tamano: '280' },
          { sku: 'PTK-TEST-000001', trackStock: false, imageFile: 'img-blanco.webp' },
        ),
        variant(
          { color: 'blanco', tamano: '380' },
          { sku: 'PTK-TEST-000390', stockQuantity: 3, imageFile: 'img-blanco.webp' },
        ),
        variant(
          { color: 'negro', tamano: '280' },
          { stockQuantity: 2, allowBackorder: true, maxPerOrder: 2, imageFile: 'img-negro.webp' },
        ),
        variant(
          { color: 'negro', tamano: '380' },
          { stockQuantity: -1, imageFile: 'img-negro.webp' },
        ),
      ],
    }),
    product('cuaderno-sin-sistema', {
      categorySlugs: ['lampara'],
      options: [
        {
          slug: 'tipo-de-hoja',
          name: 'Tipo de hoja',
          values: [
            { slug: 'cuadro', label: 'Cuadro', colorHex: null },
            { slug: 'punto', label: 'Punto', colorHex: null },
          ],
        },
      ],
      variants: [variant({ 'tipo-de-hoja': 'cuadro' }), variant({ 'tipo-de-hoja': 'punto' })],
    }),
    product('fuera-de-la-tabla', {}),
  ],
};

const MAPPING: Record<string, PublicationMapping> = {
  'lampara-trapecio-test': {
    memberOption: 'tamano',
    members: [
      { sku: 'PTK-TEST-000001', value: '280' },
      { sku: 'PTK-TEST-000390', value: '380' },
    ],
    note: 'la web ofrece 380 y el sistema tiene 390',
  },
  'cuaderno-sin-sistema': { members: [], note: 'no existe en el sistema' },
};

/**
 * F9·2: el catálogo de la web pasa al sistema con los servicios del panel. Las
 * fotos se guardan en un volumen temporal.
 */
describe('[int] Importación del catálogo de la web', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fx: Fixtures;
  let base: string;
  let from: string;
  let lines: string[];
  const colors: Record<string, string> = {};

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'catalog-import-'));
    const storage = new StorageService({
      media: join(base, 'media'),
      private: join(base, 'private'),
    });
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);

    // La carpeta de la web: catalog.json y media/ con fotos de verdad.
    from = join(base, 'seed');
    await mkdir(join(from, 'media'), { recursive: true });
    await writeFile(join(from, 'catalog.json'), JSON.stringify(CATALOG));
    const files = ['img-cat', 'img-blanco', 'img-negro', 'img-ambas', 'img-tapa'];
    for (const [i, name] of files.entries()) {
      const data = await sharp({
        create: { width: 40, height: 50, channels: 3, background: { r: 40 * i, g: 90, b: 160 } },
      })
        .webp()
        .toBuffer();
      await writeFile(join(from, 'media', `${name}.webp`), data);
    }
  });

  afterAll(async () => {
    await moduleRef.close();
    await rm(base, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await rm(join(base, 'media'), { recursive: true, force: true });
    fx = await seedFixtures(prisma);
    lines = [];
    await prisma.material.update({ where: { id: fx.filamentId }, data: { sku: 'PLA-TEST' } });
    for (const nombre of ['Blanco', 'Negro']) {
      colors[nombre] = (
        await prisma.material.create({
          data: {
            name: `PLA ${nombre}`,
            color: nombre,
            type: MaterialType.FILAMENT,
            unit: MaterialUnit.KG,
            parentId: fx.filamentId,
          },
        })
      ).id;
    }
    await prisma.product.create({
      data: {
        name: 'Trapecio 390',
        sku: 'PTK-TEST-000390',
        categoryId: fx.categoryId,
        pieces: {
          create: [
            { name: 'Pantalla', grams: 80, printMinutes: 120, defaultFilamentId: fx.filamentId },
          ],
        },
        channels: { create: [{ channelId: fx.channelId, isEnabled: true }] },
      },
    });
  });

  const run = (opts: Partial<ImportOptions> = {}) =>
    StorefrontCatalogImporter.from(moduleRef).run({
      from,
      line: 'PLA-TEST',
      actorId: fx.userId,
      dryRun: false,
      log: (line) => lines.push(line),
      mapping: MAPPING,
      ...opts,
    });
  const bySlug = async (slug: string) => {
    const { id } = await prisma.webProduct.findUniqueOrThrow({ where: { slug } });
    return moduleRef.get(WebProductsService).get(id);
  };

  it('crea las publicaciones con sus variantes, fotos y categorías', async () => {
    const summary = await run();
    expect(summary).toEqual({
      imported: 2,
      skipped: 0,
      failed: 1,
      hidden: 1,
      drafts: 1,
      variants: 4,
      images: 4,
      categories: 2,
    });
    expect(lines.join('\n')).toMatch(/✗ fuera-de-la-tabla: no está en la tabla de correspondencia/);
    expect(lines.join('\n')).toMatch(/! la web ofrece 380 y el sistema tiene 390/);

    const [lampara, mesa] = await Promise.all([
      prisma.webCategory.findUniqueOrThrow({ where: { slug: 'lampara' } }),
      prisma.webCategory.findUniqueOrThrow({ where: { slug: 'lampara-de-mesa' } }),
    ]);
    expect(mesa.parentId).toBe(lampara.id);
    expect(lampara.imagePath).toMatch(/^categories\//);

    const trapecio = await bySlug('lampara-trapecio-test');
    // Lista para publicar, pero oculta: nunca pasó por la tienda.
    expect(trapecio).toMatchObject({
      name: 'Lámpara Trapecio — Mesa',
      description: 'Hecha en **Mendoza**.',
      status: WebProductStatus.HIDDEN,
      publishedAt: null,
      optionLabel: 'Tamaño',
    });
    expect(trapecio.members.map((m) => m.valueLabel)).toEqual(['280', '380']);
    expect(trapecio.categories.map((c) => c.slug).sort()).toEqual(['lampara', 'lampara-de-mesa']);

    const gallery = [...trapecio.images].sort((a, b) => a.position - b.position);
    expect(gallery.map((i) => [i.alt, i.colorMaterialId])).toEqual([
      ['Trapecio blanca', colors.Blanco],
      ['Trapecio negra', colors.Negro],
      ['', null],
    ]);
    for (const i of gallery) await access(join(base, 'media', i.path));

    const variants = Object.fromEntries(
      trapecio.variants.map((v) => [
        `${v.options.map((o) => o.label).join('/')}/${v.memberLabel}`,
        {
          legacySku: v.legacySku,
          availability: v.availability,
          stockQuantity: v.stockQuantity,
          maxPerOrder: v.maxPerOrder,
          image: gallery.findIndex((i) => i.id === v.imageId),
        },
      ]),
    );
    expect(variants).toEqual({
      'Blanco/280': {
        legacySku: 'PTK-TEST-000001',
        availability: 'MADE_TO_ORDER',
        stockQuantity: 0,
        maxPerOrder: null,
        image: 0,
      },
      'Blanco/380': {
        legacySku: 'PTK-TEST-000390',
        availability: 'STOCK_ONLY',
        stockQuantity: 3,
        maxPerOrder: null,
        image: 0,
      },
      'Negro/280': {
        legacySku: null,
        availability: 'STOCK_THEN_ORDER',
        stockQuantity: 2,
        maxPerOrder: 2,
        image: 1,
      },
      'Negro/380': {
        legacySku: null,
        availability: 'STOCK_ONLY',
        stockQuantity: 0,
        maxPerOrder: null,
        image: 1,
      },
    });

    // Sin producto del sistema: contenido y fotos, sin variantes, en borrador.
    const cuaderno = await bySlug('cuaderno-sin-sistema');
    expect(cuaderno).toMatchObject({ status: WebProductStatus.DRAFT, variants: [], members: [] });
    expect(cuaderno.attributes.map((a) => a.values.map((v) => v.slug))).toEqual([
      ['cuadro', 'punto'],
    ]);
    expect(cuaderno.images).toHaveLength(1);
  });

  it('una segunda corrida no duplica ni toca lo importado', async () => {
    await run();
    const trapecio = await bySlug('lampara-trapecio-test');
    await moduleRef
      .get(WebProductsService)
      .update(trapecio.id, { slug: 'trapecio-de-mesa' }, fx.userId);

    expect(await run()).toMatchObject({ imported: 0, skipped: 2, failed: 1, categories: 0 });
    expect(await prisma.webProduct.count()).toBe(2);
    expect(await prisma.webImage.count()).toBe(4);
    expect(await prisma.webCategory.count()).toBe(2);
  });

  it('la simulación informa y no escribe nada', async () => {
    const summary = await run({ dryRun: true });
    expect(summary).toMatchObject({
      imported: 2,
      failed: 1,
      variants: 4,
      images: 4,
      categories: 2,
    });
    expect(lines.join('\n')).toMatch(/2 publicaciones se importarían/);
    expect(await prisma.webProduct.count()).toBe(0);
    expect(await prisma.webCategory.count()).toBe(0);
  });

  it('si una publicación falla a mitad de camino, no queda nada de ella', async () => {
    jest
      .spyOn(moduleRef.get(WebCategoriesService), 'setProductCategories')
      .mockRejectedValueOnce(new Error('se cortó'));

    const summary = await run();
    expect(summary).toMatchObject({ imported: 1, failed: 2 });
    expect(lines.join('\n')).toMatch(/✗ lampara-trapecio-test: se cortó/);
    expect(await prisma.webProduct.findUnique({ where: { slug: 'lampara-trapecio-test' } })).toBe(
      null,
    );
    // Solo queda la foto del cuaderno.
    const files = await readdir(join(base, 'media', 'catalog'), { recursive: true });
    expect(files.filter((f) => f.endsWith('.webp'))).toHaveLength(1);

    // La próxima corrida la crea.
    expect(await run()).toMatchObject({ imported: 1, skipped: 1 });
  });
});
