import type { TestingModule } from '@nestjs/testing';
import { MaterialType, MaterialUnit, PrismaClient, WebPriceState } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { WebCategoriesService } from './web-categories.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebProductsService } from './web-products.service';
import { WebPublicationService } from './web-publication.service';
import { WebVariantsService } from './web-variants.service';
import { TEST_DATABASE_URL } from '../../../test/db-url';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F10·1: las vistas de storefront_v1 muestran solo lo publicado y vendible.
 * Se consultan con el dueño de la base; que el lector del sitio vea esto y nada
 * más lo prueba storefront-contract.int-spec.ts (F10·3).
 */
describe('[int] Vistas storefront_v1', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let owner: PrismaClient;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let pubId: string;
  let p390: string;
  let color: Record<string, string>;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    owner = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  });

  afterAll(async () => {
    await owner.$disconnect();
    await close();
  });

  const view = <T = Record<string, unknown>>(name: string) =>
    owner.$queryRawUnsafe<T[]>(`SELECT * FROM storefront_v1.${name}`);

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    color = {};
    for (const [nombre, hex] of [
      ['Negro', '#111111'],
      ['Blanco', '#ffffff'],
    ] as const) {
      color[nombre] = (
        await prisma.material.create({
          data: {
            name: `PLA ${nombre}`,
            color: nombre,
            colorHex: hex,
            type: MaterialType.FILAMENT,
            unit: MaterialUnit.KG,
            parentId: fx.filamentId,
          },
        })
      ).id;
    }
    p390 = (
      await prisma.product.create({
        data: {
          name: 'Trapecio 390',
          sku: 'PTK-TEST-000390',
          categoryId: fx.categoryId,
          pieces: {
            create: [
              { name: 'Pantalla', grams: 90, printMinutes: 150, defaultFilamentId: fx.filamentId },
            ],
          },
          channels: { create: [{ channelId: fx.channelId, isEnabled: true }] },
        },
      })
    ).id;

    // Una publicación completa: 2 tamaños × 2 colores, foto, descripción y categoría.
    const products = moduleRef.get(WebProductsService);
    pubId = (
      await products.create(
        {
          name: 'Lámpara Trapecio',
          description: 'Lámpara de mesa.',
          optionLabel: 'Tamaño',
          members: [
            { productId: fx.productId, valueLabel: '280' },
            { productId: p390, valueLabel: '390' },
          ],
        },
        fx.userId,
      )
    ).id;
    await moduleRef.get(WebColorOptionsService).set(
      pubId,
      [
        {
          label: 'Color',
          filamentLineId: fx.filamentId,
          colorIds: [color.Negro!, color.Blanco!],
        },
      ],
      fx.userId,
    );
    await moduleRef.get(WebVariantsService).regenerate(pubId, fx.userId);
    await prisma.webImage.create({
      data: { webProductId: pubId, path: 'catalog/x.webp', width: 10, height: 10 },
    });
    const categories = moduleRef.get(WebCategoriesService);
    const lamparas = await categories.create({ name: 'Lámparas' }, fx.userId);
    await categories.setProductCategories(pubId, [lamparas.id], fx.userId);
    await moduleRef.get(WebPublicationService).publish(pubId, fx.userId);
  });

  it('una publicación publicada se ve entera, con montos en centavos', async () => {
    const [product] = await view<{ id: string; slug: string; option_label: string }>('products');
    expect(product).toMatchObject({ id: pubId, slug: 'lampara-trapecio', option_label: 'Tamaño' });

    const variants = await view<{
      sku: string;
      price_cents: number;
      sort: number;
      member_value_label: string;
    }>('variants');
    expect(variants).toHaveLength(4);
    const price280 = await prisma.webPrice.findUniqueOrThrow({
      where: { productId: fx.productId },
    });
    const v280 = variants.find((v) => v.member_value_label === '280')!;
    expect(v280.price_cents).toBe(Math.round(Number(price280.price) * 100));
    expect(variants.map((v) => v.sort).sort()).toEqual([1, 2, 3, 4]);

    const options = await view<{
      option_kind: string;
      value_label: string;
      color_hex: string | null;
    }>('variant_options');
    // Cada variante: su tamaño y su color.
    expect(options.filter((o) => o.option_kind === 'member')).toHaveLength(4);
    expect(options.filter((o) => o.option_kind === 'color')).toHaveLength(4);
    expect(options.find((o) => o.value_label === 'Negro')?.color_hex).toBe('#111111');

    expect(await view('images')).toHaveLength(1);
    expect(await view('product_categories')).toHaveLength(1);
    expect(await view('categories')).toHaveLength(1);
  });

  it('una publicación oculta no aparece en ninguna vista', async () => {
    await moduleRef.get(WebPublicationService).hide(pubId, fx.userId);
    for (const name of [
      'products',
      'variants',
      'variant_options',
      'images',
      'product_categories',
    ]) {
      expect(await view(name)).toEqual([]);
    }
  });

  it('un producto del sistema archivado saca sus variantes', async () => {
    await prisma.product.update({ where: { id: p390 }, data: { isActive: false } });
    const variants = await view<{ member_value_label: string }>('variants');
    expect(variants.map((v) => v.member_value_label)).toEqual(['280', '280']);
    // Con un solo tamaño a la venta ya no se ofrece elegir tamaño.
    const options = await view<{ option_kind: string }>('variant_options');
    expect(options.every((o) => o.option_kind === 'color')).toBe(true);
  });

  it('un color inactivo en Insumos saca sus variantes', async () => {
    await prisma.material.update({ where: { id: color.Blanco! }, data: { isActive: false } });
    const options = await view<{ option_kind: string; value_label: string }>('variant_options');
    expect(await view('variants')).toHaveLength(2);
    expect(options.filter((o) => o.option_kind === 'color').map((o) => o.value_label)).toEqual([
      'Negro',
      'Negro',
    ]);
  });

  it('un producto sin precio saca sus variantes; sin ninguna variante, la publicación desaparece', async () => {
    await prisma.webPrice.update({
      where: { productId: p390 },
      data: { state: WebPriceState.NO_PRICE, price: null },
    });
    expect(await view('variants')).toHaveLength(2);

    await prisma.webPrice.update({
      where: { productId: fx.productId },
      data: { state: WebPriceState.NO_PRICE, price: null },
    });
    expect(await view('variants')).toEqual([]);
    expect(await view('products')).toEqual([]);
  });

  it('los slugs viejos redirigen y los ajustes siempre tienen una fila', async () => {
    await moduleRef.get(WebProductsService).update(pubId, { slug: 'trapecio-mesa' }, fx.userId);
    expect(await view('slug_redirects')).toEqual([
      { old_slug: 'lampara-trapecio', product_slug: 'trapecio-mesa' },
    ]);

    expect(await view('store_settings')).toEqual([
      {
        shipping_flat_rate_cents: null,
        free_shipping_from_cents: null,
        pickup_enabled: true,
        pickup_instructions: '',
        bank_transfer_enabled: false,
        bank_transfer_instructions: '',
        notification_email: '',
        cash_enabled: false,
        mercadopago_enabled: true,
        modo_enabled: false,
        gocuotas_enabled: false,
      },
    ]);
    await prisma.ecommerceSettings.create({
      data: { id: 1, shippingFlatRate: 4500.5, pickupEnabled: false },
    });
    const [settings] = await view<{ shipping_flat_rate_cents: number; pickup_enabled: boolean }>(
      'store_settings',
    );
    expect(settings).toMatchObject({ shipping_flat_rate_cents: 450050, pickup_enabled: false });
  });

  it('una categoría hija de una madre inactiva no aparece', async () => {
    const categories = moduleRef.get(WebCategoriesService);
    const [madre] = await categories.list();
    const hija = await categories.create({ name: 'De mesa', parentId: madre!.id }, fx.userId);
    expect((await view<{ id: string }>('categories')).map((c) => c.id)).toContain(hija.id);

    await categories.update(madre!.id, { isActive: false }, fx.userId);
    expect(await view('categories')).toEqual([]);
    expect(await view('product_categories')).toEqual([]);
  });
});
