import type { TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { WebPublicationService } from '@/modules/web-catalog/web-publication.service';
import { WebVariantsService } from '@/modules/web-catalog/web-variants.service';
import { TEST_READER_DATABASE_URL } from './db-url';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from './harness';

/**
 * Contrato de lectura del sitio (plan F10·3): conectado como el rol con el que
 * lee la tienda (storefront_reader), se ve storefront_v1 y nada más.
 *
 * Las columnas de cada vista están escritas acá a propósito: cambiarlas es
 * cambiar el contrato con el sitio (docs/contrato-storefront-v1.md). Un cambio
 * aditivo se suma acá y al documento; uno que rompe va en storefront_v2.
 */
const CONTRACT: Record<string, Array<[string, string]>> = {
  products: [
    ['id', 'text'],
    ['slug', 'text'],
    ['name', 'text'],
    ['summary', 'text'],
    ['description', 'text'],
    ['seo_title', 'text'],
    ['seo_description', 'text'],
    ['option_label', 'text'],
    ['featured', 'boolean'],
    ['sort_order', 'integer'],
    ['published_at', 'timestamp without time zone'],
    ['updated_at', 'timestamp without time zone'],
  ],
  variants: [
    ['id', 'text'],
    ['product_id', 'text'],
    ['sku', 'text'],
    ['member_value_key', 'text'],
    ['member_value_label', 'text'],
    ['member_sort', 'integer'],
    ['price_cents', 'integer'],
    ['availability', 'text'],
    ['available_quantity', 'integer'],
    ['max_per_order', 'integer'],
    ['lead_time_days', 'integer'],
    ['image_id', 'text'],
    ['sort', 'integer'],
  ],
  variant_options: [
    ['variant_id', 'text'],
    ['option_kind', 'text'],
    ['option_key', 'text'],
    ['option_label', 'text'],
    ['value_key', 'text'],
    ['value_label', 'text'],
    ['color_hex', 'text'],
    ['option_sort', 'integer'],
    ['value_sort', 'integer'],
  ],
  images: [
    ['id', 'text'],
    ['product_id', 'text'],
    ['path', 'text'],
    ['alt', 'text'],
    ['width', 'integer'],
    ['height', 'integer'],
    ['position', 'integer'],
    ['color_value_key', 'text'],
  ],
  categories: [
    ['id', 'text'],
    ['slug', 'text'],
    ['name', 'text'],
    ['description', 'text'],
    ['parent_id', 'text'],
    ['image_path', 'text'],
    ['sort_order', 'integer'],
  ],
  product_categories: [
    ['product_id', 'text'],
    ['category_id', 'text'],
  ],
  slug_redirects: [
    ['old_slug', 'text'],
    ['product_slug', 'text'],
  ],
  store_settings: [
    ['shipping_flat_rate_cents', 'integer'],
    ['free_shipping_from_cents', 'integer'],
    ['pickup_enabled', 'boolean'],
    ['pickup_instructions', 'text'],
    ['bank_transfer_enabled', 'boolean'],
    ['bank_transfer_instructions', 'text'],
    ['notification_email', 'text'],
    ['cash_enabled', 'boolean'],
    ['mercadopago_enabled', 'boolean'],
    ['modo_enabled', 'boolean'],
    ['gocuotas_enabled', 'boolean'],
  ],
};

describe('[int] Contrato storefront_v1 visto por el lector del sitio', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reader: PrismaClient;
  let close: () => Promise<void>;
  let fx: Fixtures;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    reader = new PrismaClient({ datasources: { db: { url: TEST_READER_DATABASE_URL } } });
  });

  afterAll(async () => {
    await reader.$disconnect();
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
  });

  const denied = /permission denied|read-only transaction/;

  it('(a) lee cada vista, sin calificar el esquema (search_path = storefront_v1)', async () => {
    for (const view of Object.keys(CONTRACT)) {
      await expect(reader.$queryRawUnsafe(`SELECT * FROM ${view}`)).resolves.toEqual(
        expect.any(Array),
      );
    }
    const [settings] = await reader.$queryRawUnsafe<Array<{ pickup_enabled: boolean }>>(
      'SELECT * FROM store_settings',
    );
    expect(settings!.pickup_enabled).toBe(true);
  });

  it.each(['users', 'supplier_materials', 'customers', 'quotes', 'web_products', 'web_prices'])(
    '(b) no puede leer public.%s',
    async (table) => {
      await expect(reader.$queryRawUnsafe(`SELECT * FROM public.${table} LIMIT 1`)).rejects.toThrow(
        denied,
      );
    },
  );

  it('(c) no puede escribir, ni en las tablas ni a través de las vistas', async () => {
    // Según el caso corta el permiso, la sesión de solo lectura o que la vista
    // no es actualizable; lo que importa es que no se escribe.
    const rejected = /permission denied|read-only transaction|not automatically updatable/;
    await expect(
      reader.$executeRawUnsafe(
        `INSERT INTO public.web_categories (id, slug, name, "updatedAt") VALUES ('x', 'x', 'x', now())`,
      ),
    ).rejects.toThrow(rejected);
    await expect(
      reader.$executeRawUnsafe(`UPDATE storefront_v1.products SET name = 'hackeado'`),
    ).rejects.toThrow(rejected);
    await expect(reader.$executeRawUnsafe(`DELETE FROM storefront_v1.categories`)).rejects.toThrow(
      rejected,
    );
    await expect(reader.$executeRawUnsafe('CREATE TABLE storefront_v1.x (a int)')).rejects.toThrow(
      rejected,
    );
  });

  it('(d) las columnas de cada vista son las del contrato', async () => {
    const rows = await reader.$queryRawUnsafe<
      Array<{ table_name: string; column_name: string; data_type: string }>
    >(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'storefront_v1'
       ORDER BY table_name, ordinal_position`,
    );
    const actual: Record<string, Array<[string, string]>> = {};
    for (const r of rows) (actual[r.table_name] ??= []).push([r.column_name, r.data_type]);
    expect(actual).toEqual(CONTRACT);
  });

  it('(e) lo que no está publicado no aparece', async () => {
    const products = moduleRef.get(WebProductsService);
    const pub = await products.create(
      {
        name: 'Maceta',
        description: 'Maceta facetada.',
        members: [{ productId: fx.productId, valueLabel: '' }],
      },
      fx.userId,
    );
    await moduleRef.get(WebVariantsService).regenerate(pub.id, fx.userId);
    await prisma.webImage.create({
      data: { webProductId: pub.id, path: 'catalog/m.webp', width: 10, height: 10 },
    });
    const count = async (view: string) =>
      Number(
        (
          await reader.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM ${view}`)
        )[0]!.n,
      );

    // Borrador: lista para vender, pero no publicada.
    expect([await count('products'), await count('variants'), await count('images')]).toEqual([
      0, 0, 0,
    ]);

    await moduleRef.get(WebPublicationService).publish(pub.id, fx.userId);
    expect([await count('products'), await count('variants'), await count('images')]).toEqual([
      1, 1, 1,
    ]);

    await moduleRef.get(WebPublicationService).hide(pub.id, fx.userId);
    expect([await count('products'), await count('variants'), await count('images')]).toEqual([
      0, 0, 0,
    ]);
  });
});
