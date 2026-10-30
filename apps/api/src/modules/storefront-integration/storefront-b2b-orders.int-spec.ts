import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { CustomerType, MaterialType, MaterialUnit, QuoteStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { generateIntegrationKey } from '@/common/integration-auth/integration-keys';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F21·3: el pedido de un cliente B2B entra al panel como cotización enviada, con
 * los precios del sistema. Lo que manda el sitio no se cree.
 */
describe('[int] Pedidos B2B de la tienda', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixtures;
  let key: string;
  let token: string;
  let pieceId: string;
  let negro: string;
  let otraLinea: string;
  let customerId: string;

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

  const color = (name: string, parentId: string) =>
    prisma.material.create({
      data: {
        name: `PLA ${name}`,
        color: name,
        colorHex: '#111111',
        type: MaterialType.FILAMENT,
        unit: MaterialUnit.KG,
        parentId,
      },
    });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.integrationClient.deleteMany();
    await prisma.outboxEvent.deleteMany();
    fx = await seedFixtures(prisma);
    await prisma.channel.update({ where: { id: fx.channelId }, data: { slug: 'directa' } });
    const generated = generateIntegrationKey();
    await prisma.integrationClient.create({
      data: {
        name: 'sitio',
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scopes: ['b2b-orders:write'],
      },
    });
    key = generated.key;
    token = app.get(JwtService).sign({
      sub: fx.userId,
      email: 'test@plastik.local',
      role: 'admin',
      permissions: ['quote:read', 'quote:create'],
    });
    pieceId = (await prisma.productPiece.findFirstOrThrow({ where: { productId: fx.productId } }))
      .id;
    negro = (await color('Negro', fx.filamentId)).id;
    const linea = await prisma.material.create({
      data: { name: 'PETG', type: MaterialType.FILAMENT, unit: MaterialUnit.KG },
    });
    otraLinea = (await color('Rojo', linea.id)).id;

    const customer = await prisma.customer.create({
      data: {
        name: 'Regalería Sur',
        type: CustomerType.WHOLESALE,
        email: 'compras@regaleria.example.com',
        externalId: 'web-regaleria',
        hasPortalAccess: true,
        categoryCommitments: {
          create: { categoryId: fx.categoryId, monthlyCommitmentQty: 20 },
        },
      },
    });
    customerId = customer.id;
  });

  const body = (over: object = {}) => ({
    externalId: randomUUID(),
    customerExternalId: 'web-regaleria',
    note: 'Para la semana que viene.',
    items: [{ productId: fx.productId, quantity: 3, colors: { [pieceId]: negro } }],
    ...over,
  });
  const post = (payload: object, auth = key) =>
    request(app.getHttpServer())
      .post('/integrations/storefront/v1/b2b-orders')
      .set('Authorization', `Bearer ${auth}`)
      .send(payload);

  it('entra como cotización enviada, con factura y con los colores', async () => {
    const res = await post(body()).expect(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      code: expect.stringMatching(/^Q-/),
      totalCents: expect.any(Number),
      replayed: false,
    });
    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { items: true },
    });
    expect(quote).toMatchObject({
      status: QuoteStatus.SENT,
      customerId,
      customerName: 'Regalería Sur',
      customerNotes: 'Para la semana que viene.',
      channelId: fx.channelId,
      withInvoice: true,
      createdById: null,
    });
    expect(quote.items[0]!.filamentOverrides).toEqual({ [pieceId]: negro });
    expect(await prisma.auditLog.count({ where: { action: 'received-from-store' } })).toBe(1);
  });

  it('el precio es el del motor, no uno que mande el sitio', async () => {
    const res = await post(
      body({
        items: [
          { productId: fx.productId, quantity: 1, colors: { [pieceId]: negro }, unitPriceCents: 1 },
        ],
      }),
    ).expect(201);
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(Number(quote.total)).toBeGreaterThan(100);
    expect(res.body.totalCents).toBe(Math.round(Number(quote.total) * 100));
  });

  it('repetir la entrega no duplica el pedido', async () => {
    const payload = body();
    const first = await post(payload).expect(201);
    const again = await post(payload).expect(201);
    expect(again.body).toMatchObject({ id: first.body.id, replayed: true });
    expect(await prisma.quote.count()).toBe(1);
  });

  it.each([
    [
      'sin la casilla',
      async () => {
        await prisma.customer.update({
          where: { id: customerId },
          data: { hasPortalAccess: false },
        });
      },
      () => body(),
      'CATALOG_DISABLED',
    ],
    [
      'un color de otra línea',
      async () => {},
      () =>
        body({
          items: [{ productId: fx.productId, quantity: 1, colors: { [pieceId]: otraLinea } }],
        }),
      'INVALID_COLOR',
    ],
    [
      'una pieza sin color',
      async () => {},
      () => body({ items: [{ productId: fx.productId, quantity: 1, colors: {} }] }),
      'MISSING_COLOR',
    ],
    [
      'un producto que no puede comprar',
      async () => {
        const otra = await prisma.category.create({
          data: { name: 'Otra', slug: 'otra', baseMarkupPct: 60 },
        });
        await prisma.product.update({ where: { id: fx.productId }, data: { categoryId: otra.id } });
      },
      () => body(),
      'PRODUCT_NOT_ALLOWED',
    ],
  ])('rechaza %s', async (_caso, prepare, payload, reason) => {
    await prepare();
    const res = await post(payload()).expect(422);
    expect(res.body.details).toMatchObject({ reason });
    expect(await prisma.quote.count()).toBe(0);
  });

  it('al responderla, el sitio se entera; pasar a borrador no avisa', async () => {
    const { body: placed } = await post(body()).expect(201);
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: placed.id } });
    await prisma.outboxEvent.deleteMany();
    const status = (next: string) =>
      request(app.getHttpServer())
        .patch(`/quotes/${placed.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: next });
    await status('DRAFT').expect(200);
    expect(await prisma.outboxEvent.count()).toBe(0);
    await status('SENT').expect(200);
    await status('ACCEPTED').expect(200);
    const [sent] = await prisma.outboxEvent.findMany({
      where: { type: 'b2b_order.status_changed' },
    });
    expect(sent!.payload).toMatchObject({
      externalId: quote.externalId,
      code: quote.code,
      status: 'ACCEPTED',
      totalCents: placed.totalCents,
      changedAt: expect.any(String),
    });
  });

  it('en el panel: filtro, contador y colores en el detalle', async () => {
    const { body: placed } = await post(body()).expect(201);
    const get = (path: string) =>
      request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`).expect(200);
    expect((await get('/quotes/store-pending/count')).body).toEqual({ count: 1 });
    const list = await get('/quotes?source=store');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: placed.id, fromStore: true });
    const detail = await get(`/quotes/${placed.id}`);
    expect(detail.body.fromStore).toBe(true);
    expect(detail.body.items[0].colors).toEqual([
      { pieceName: 'Cuerpo', colorName: 'Negro', colorHex: '#111111' },
    ]);
  });

  it('sin el alcance b2b-orders:write, 403', async () => {
    const other = generateIntegrationKey();
    await prisma.integrationClient.create({
      data: { name: 'otra', keyHash: other.hash, keyPrefix: other.prefix, scopes: ['ping'] },
    });
    await post(body(), other.key).expect(403);
  });
});
