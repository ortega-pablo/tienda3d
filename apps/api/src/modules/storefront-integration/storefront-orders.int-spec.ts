import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MaterialType, MaterialUnit, WebAvailability } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  generateIntegrationKey,
  INTEGRATION_SCOPES,
} from '@/common/integration-auth/integration-keys';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { WebColorOptionsService } from '@/modules/web-catalog/web-color-options.service';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { WebPublicationService } from '@/modules/web-catalog/web-publication.service';
import { WebVariantsService } from '@/modules/web-catalog/web-variants.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F14·3: un pedido del sitio se registra solo si el precio y el stock siguen
 * valiendo; repetirlo no lo duplica y la última unidad se vende una sola vez.
 */
describe('[int] Pedidos de la tienda online', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixtures;
  let key: string;
  let pubId: string;
  /** Las cuatro variantes de la Trapecio (2 tamaños × 2 colores), con su precio de la vista. */
  let variants: Array<{ id: string; price_cents: number }>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.integrationClient.deleteMany();
    await prisma.inboundEvent.deleteMany();
    await prisma.outboxEvent.deleteMany();
    fx = await seedFixtures(prisma);
    const generated = generateIntegrationKey();
    await prisma.integrationClient.create({
      data: {
        name: 'storefront',
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scopes: [...INTEGRATION_SCOPES],
      },
    });
    key = generated.key;

    const colors: string[] = [];
    for (const nombre of ['Negro', 'Blanco']) {
      colors.push(
        (
          await prisma.material.create({
            data: {
              name: `PLA ${nombre}`,
              color: nombre,
              type: MaterialType.FILAMENT,
              unit: MaterialUnit.KG,
              parentId: fx.filamentId,
            },
          })
        ).id,
      );
    }
    const p390 = await prisma.product.create({
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
    });
    pubId = (
      await app.get(WebProductsService).create(
        {
          name: 'Lámpara Trapecio',
          description: 'Lámpara de mesa.',
          optionLabel: 'Tamaño',
          members: [
            { productId: fx.productId, valueLabel: '280' },
            { productId: p390.id, valueLabel: '390' },
          ],
        },
        fx.userId,
      )
    ).id;
    await app
      .get(WebColorOptionsService)
      .set(pubId, [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: colors }], fx.userId);
    await app.get(WebVariantsService).regenerate(pubId, fx.userId);
    await prisma.webImage.create({
      data: { webProductId: pubId, path: 'catalog/x.webp', width: 10, height: 10 },
    });
    await app.get(WebPublicationService).publish(pubId, fx.userId);
    variants = await prisma.$queryRaw`
      SELECT id, price_cents FROM storefront_v1.variants ORDER BY sort`;
    await prisma.outboxEvent.deleteMany();
  });

  const order = (items: Array<{ id: string; quantity: number; priceCents?: number }>) => ({
    externalId: randomUUID(),
    number: 1001,
    customer: {
      externalId: 'web-ana',
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Prueba',
      phone: '+54 9 261 555-0000',
      documentNumber: null,
    },
    paymentMethod: 'BANK_TRANSFER',
    paymentStatus: 'AWAITING_TRANSFER',
    deliveryMethod: 'PICKUP',
    shipping: null,
    shippingLabel: 'Retiro por el taller',
    shippingCents: 0,
    subtotalCents: 0,
    totalCents: 0,
    placedAt: '2026-10-29T15:00:00Z',
    items: items.map((i) => ({
      webVariantId: i.id,
      quantity: i.quantity,
      unitPriceCents: i.priceCents ?? variants.find((v) => v.id === i.id)!.price_cents,
      productName: 'Lámpara Trapecio',
      variantLabel: '280 · Negro',
      selections: [],
    })),
  });

  const post = (body: object) =>
    request(app.getHttpServer())
      .post('/integrations/storefront/v1/orders')
      .set('Authorization', `Bearer ${key}`)
      .send(body);

  const setStock = (id: string, stockQuantity: number) =>
    prisma.webVariant.update({
      where: { id },
      data: { availability: WebAvailability.STOCK_ONLY, stockQuantity },
    });

  it('registra el pedido, reserva el stock y le da el código', async () => {
    const [a, b] = variants;
    await setStock(a!.id, 3);
    const res = await post(
      order([
        { id: a!.id, quantity: 2 },
        { id: b!.id, quantity: 1 },
      ]),
    ).expect(201);
    expect(res.body).toMatchObject({ code: 'W-2026-0001', replayed: false });

    expect(
      (await prisma.webVariant.findUniqueOrThrow({ where: { id: a!.id } })).stockQuantity,
    ).toBe(1);
    const saved = await prisma.webOrder.findUniqueOrThrow({
      where: { code: 'W-2026-0001' },
      include: { items: { orderBy: { quantity: 'desc' } }, customer: true, events: true },
    });
    expect(saved.items.map((i) => [i.quantity, i.reservedQuantity, i.sku])).toEqual([
      [2, 2, expect.stringMatching(/-V\d\d$/)],
      [1, 0, expect.stringMatching(/-V\d\d$/)],
    ]);
    expect(saved.customer).toMatchObject({ email: 'ana@example.com', externalId: 'web-ana' });
    expect(saved.events).toHaveLength(1);
    // El stock cambió lo que muestra la tienda.
    expect(await prisma.outboxEvent.count({ where: { type: 'catalog.changed' } })).toBe(1);
  });

  it('repetir la llamada no duplica el pedido ni la reserva', async () => {
    const [a] = variants;
    await setStock(a!.id, 3);
    const body = order([{ id: a!.id, quantity: 2 }]);
    const first = await post(body).expect(201);
    const again = await post(body).expect(201);
    expect(again.body).toEqual({ ...first.body, replayed: true });
    expect(await prisma.webOrder.count()).toBe(1);
    expect(
      (await prisma.webVariant.findUniqueOrThrow({ where: { id: a!.id } })).stockQuantity,
    ).toBe(1);
  });

  it('si cambió un precio, 409 con el precio nuevo y nada reservado', async () => {
    const [a] = variants;
    await setStock(a!.id, 3);
    const res = await post(order([{ id: a!.id, quantity: 1, priceCents: 100 }])).expect(409);
    expect(res.body.details).toMatchObject({
      reason: 'PRICE_CHANGED',
      prices: [{ webVariantId: a!.id, priceCents: a!.price_cents }],
    });
    expect(await prisma.webOrder.count()).toBe(0);
    expect(
      (await prisma.webVariant.findUniqueOrThrow({ where: { id: a!.id } })).stockQuantity,
    ).toBe(3);
  });

  it('dos compras simultáneas de la última unidad: una sola se aprueba', async () => {
    const [a] = variants;
    await setStock(a!.id, 1);
    const results = await Promise.all([
      post(order([{ id: a!.id, quantity: 1 }])),
      post(order([{ id: a!.id, quantity: 1 }])),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const rejected = results.find((r) => r.status === 409)!;
    expect(rejected.body.details).toMatchObject({
      reason: 'OUT_OF_STOCK',
      items: [{ webVariantId: a!.id, available: 0 }],
    });
    expect(await prisma.webOrder.count()).toBe(1);
    expect(
      (await prisma.webVariant.findUniqueOrThrow({ where: { id: a!.id } })).stockQuantity,
    ).toBe(0);
  });

  it('lo que ya no está a la venta da 422', async () => {
    const [a] = variants;
    await app.get(WebPublicationService).hide(pubId, fx.userId);
    const res = await post(order([{ id: a!.id, quantity: 1 }])).expect(422);
    expect(res.body.details).toMatchObject({ reason: 'NOT_AVAILABLE', webVariantIds: [a!.id] });
    expect(await prisma.webOrder.count()).toBe(0);
  });
});
