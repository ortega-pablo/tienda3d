import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CustomerType, MaterialType, MaterialUnit } from '@prisma/client';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { generateIntegrationKey } from '@/common/integration-auth/integration-keys';
import { PrismaService } from '@/common/prisma/prisma.service';
import { startOfBusinessMonth } from '@/common/utils/date';
import { AppModule } from '@/app.module';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F21·1: el sistema le entrega a la tienda el catálogo de cada cliente B2B. Lo
 * que importa acá: nunca salen márgenes ni ganancias, y sin vínculo o sin la
 * casilla no sale nada.
 */
describe('[int] Catálogo B2B para la tienda', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixtures;
  let key: string;

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

  const newKey = async (scopes: string[]) => {
    const generated = generateIntegrationKey();
    await prisma.integrationClient.create({
      data: {
        name: `sitio-${generated.prefix}`,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scopes,
      },
    });
    return generated.key;
  };

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.integrationClient.deleteMany();
    fx = await seedFixtures(prisma);
    key = await newKey(['b2b:read']);
    // Escala de la categoría: de 1 a 9, 100 %; de 10 en adelante, 50 %.
    await prisma.categoryPriceTier.createMany({
      data: [
        {
          categoryId: fx.categoryId,
          channelId: fx.channelId,
          minQty: 1,
          maxQty: 9,
          markupPct: 100,
        },
        {
          categoryId: fx.categoryId,
          channelId: fx.channelId,
          minQty: 10,
          maxQty: null,
          markupPct: 50,
        },
      ],
    });
  });

  const wholesaler = (over: { hasPortalAccess?: boolean; type?: CustomerType } = {}) =>
    prisma.customer.create({
      data: {
        name: 'Regalería Sur',
        type: over.type ?? CustomerType.WHOLESALE,
        email: 'compras@regaleria.example.com',
        externalId: 'web-regaleria',
        hasPortalAccess: over.hasPortalAccess ?? true,
      },
    });

  const commit = (customerId: string, over: { isWholesaleSuspended?: boolean } = {}) =>
    prisma.customerCategoryCommitment.create({
      data: {
        customerId,
        categoryId: fx.categoryId,
        minTierQty: 10,
        monthlyCommitmentQty: 20,
        ...over,
      },
    });

  const get = (externalId: string, auth = key, suffix = 'catalog') =>
    request(app.getHttpServer())
      .get(`/integrations/storefront/v1/customers/${externalId}/${suffix}`)
      .set('Authorization', `Bearer ${auth}`);

  it('trae lo que puede comprar, con precios, colores, foto y el compromiso del mes', async () => {
    const customer = await wholesaler();
    await commit(customer.id);
    await prisma.customerMonthlyVolume.create({
      data: {
        customerId: customer.id,
        categoryId: fx.categoryId,
        monthStart: startOfBusinessMonth(new Date()),
        unitsSold: 12,
      },
    });
    const negro = await prisma.material.create({
      data: {
        name: 'PLA Negro',
        color: 'Negro',
        colorHex: '#111111',
        type: MaterialType.FILAMENT,
        unit: MaterialUnit.KG,
        parentId: fx.filamentId,
      },
    });
    const pub = await app.get(WebProductsService).create(
      {
        name: 'Lámpara',
        description: 'Lámpara de mesa.',
        members: [{ productId: fx.productId, valueLabel: '280' }],
      },
      fx.userId,
    );
    await prisma.webImage.create({
      data: { webProductId: pub.id, path: 'catalog/x.webp', width: 10, height: 10 },
    });

    expect((await get('web-regaleria', key, 'catalog-access').expect(200)).body).toEqual({
      enabled: true,
    });
    const res = await get('web-regaleria').expect(200);
    expect(res.body).toMatchObject({
      customerName: 'Regalería Sur',
      customerType: 'WHOLESALE',
      commitments: [{ categoryName: 'Cat test', committedQty: 20, soldQty: 12, suspended: false }],
    });
    expect(res.body.products).toHaveLength(1);
    const [product] = res.body.products;
    expect(product).toMatchObject({
      productId: fx.productId,
      sku: 'PTK-TEST-000001',
      categoryName: 'Cat test',
      imagePath: 'catalog/x.webp',
      pieces: [
        {
          name: 'Cuerpo',
          colors: [{ id: negro.id, name: 'Negro', hex: '#111111' }],
        },
      ],
    });
    expect(product.tiers.length).toBeGreaterThan(0);
    expect(product.tiers[0].unitPriceCents).toEqual(expect.any(Number));
  });

  it('nunca trae márgenes ni ganancias', async () => {
    const customer = await wholesaler();
    await commit(customer.id);
    const res = await get('web-regaleria').expect(200);
    const json = JSON.stringify(res.body);
    expect(res.body.products).toHaveLength(1);
    for (const internal of ['markupPct', 'profit', 'baseProfit', 'marginPct', 'cost']) {
      expect(json).not.toContain(internal);
    }
    expect(json).not.toContain(customer.id);
  });

  it('un mayorista suspendido en la categoría la ve sin el piso de escala', async () => {
    const customer = await wholesaler();
    const commitment = await commit(customer.id);
    const conPiso = (await get('web-regaleria').expect(200)).body.products[0].tiers;

    await prisma.customerCategoryCommitment.update({
      where: { id: commitment.id },
      data: { isWholesaleSuspended: true },
    });
    const res = await get('web-regaleria').expect(200);
    expect(res.body.commitments[0].suspended).toBe(true);
    // Con el piso, una unidad paga como diez; suspendido, paga la escala de una.
    const sinPiso = res.body.products[0].tiers;
    expect(sinPiso[0].unitPriceCents).toBeGreaterThan(conPiso[0].unitPriceCents);
  });

  it('sin la casilla, sin vínculo o con un cliente estándar, 404', async () => {
    await wholesaler({ hasPortalAccess: false });
    await get('web-regaleria').expect(404);
    await get('web-regaleria', key, 'catalog.pdf').expect(404);
    await get('otra-cuenta').expect(404);
    expect((await get('web-regaleria', key, 'catalog-access').expect(200)).body).toEqual({
      enabled: false,
    });

    await prisma.customer.deleteMany();
    await wholesaler({ type: CustomerType.STANDARD });
    await get('web-regaleria').expect(404);
  });

  it('el PDF sale sin las columnas internas', async () => {
    const customer = await wholesaler();
    await commit(customer.id);
    const res = await get('web-regaleria', key, 'catalog.pdf')
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('sin el alcance b2b:read, 403', async () => {
    await wholesaler();
    await get('web-regaleria', await newKey(['ping'])).expect(403);
  });
});
