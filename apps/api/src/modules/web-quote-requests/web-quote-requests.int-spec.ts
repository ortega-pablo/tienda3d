import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  generateIntegrationKey,
  INTEGRATION_SCOPES,
} from '@/common/integration-auth/integration-keys';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { AppModule } from '@/app.module';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F15·3: las solicitudes de personalización en el panel. Se miran, cambian de
 * estado, se descarga su archivo y de una sale una cotización a medida
 * vinculada a la solicitud y al cliente.
 */
describe('[int] Solicitudes de personalización en el panel', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let fx: Fixtures;
  let key: string;
  let token: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'web-quote-requests-'));
    const storage = new StorageService({
      media: join(base, 'media'),
      private: join(base, 'private'),
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    await rm(base, { recursive: true, force: true });
  });

  const firmar = (permissions: string[]) =>
    app
      .get(JwtService)
      .sign({ sub: fx.userId, email: 'test@plastik.local', role: 'admin', permissions });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.integrationClient.deleteMany();
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
    token = firmar(['ecommerce:orders', 'quote:create', 'quote:read']);
  });

  /** Una solicitud como la entrega el sitio (F15·2). */
  const receive = async (externalId = 'qr-1', withFile = true) => {
    const req = request(app.getHttpServer())
      .post('/integrations/storefront/v1/quote-requests')
      .set('Authorization', `Bearer ${key}`)
      .field(
        'data',
        JSON.stringify({
          externalId,
          customer: {
            externalId: 'web-ana',
            email: 'ana@example.com',
            firstName: 'Ana',
            lastName: 'Prueba',
            phone: '+54 9 261 555-0000',
            documentNumber: null,
          },
          idea: 'Un soporte para auriculares con mi nombre grabado.',
          requestedAt: '2026-10-29T15:00:00Z',
        }),
      );
    const res = await (
      withFile ? req.attach('attachment', Buffer.from('solid soporte'), 'soporte.stl') : req
    ).expect(201);
    return res.body.id as string;
  };

  const http = () => request(app.getHttpServer());
  const get = (path: string, auth = token) =>
    http().get(`/web-quote-requests${path}`).set('Authorization', `Bearer ${auth}`);

  it('lista, detalle, contador de nuevas y descarga del archivo', async () => {
    const id = await receive();
    await receive('qr-2', false);

    const list = await get('').expect(200);
    expect(list.body).toHaveLength(2);
    expect((await get('/new-count').expect(200)).body).toEqual({ count: 2 });
    expect((await get('?status=QUOTED').expect(200)).body).toHaveLength(0);

    const detail = await get(`/${id}`).expect(200);
    expect(detail.body).toMatchObject({
      name: 'Ana Prueba',
      email: 'ana@example.com',
      status: 'NEW',
      hasAttachment: true,
      attachment: { name: 'soporte.stl' },
      quote: null,
    });

    const file = await get(`/${id}/attachment`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="soporte.stl"/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.body.toString()).toBe('solid soporte');

    const other = list.body.find((r: { id: string }) => r.id !== id);
    await get(`/${other.id}/attachment`).expect(404);
  });

  it('el admin cambia el estado y deja una nota', async () => {
    const id = await receive();
    const res = await http()
      .patch(`/web-quote-requests/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'IN_REVIEW', adminNote: 'Pedirle medidas.' })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'IN_REVIEW', adminNote: 'Pedirle medidas.' });
    expect((await get('/new-count').expect(200)).body).toEqual({ count: 0 });
    expect(
      await prisma.auditLog.count({ where: { entity: 'WebQuoteRequest', action: 'update' } }),
    ).toBe(1);
  });

  it('de una solicitud sale una cotización R-AAAA-NNNN vinculada a ella y al cliente', async () => {
    const id = await receive();
    const { customerId } = await prisma.webQuoteRequest.findUniqueOrThrow({ where: { id } });
    const quote = (webQuoteRequestId: string) =>
      http()
        .post('/quotes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId,
          customerName: 'Ana Prueba',
          channelId: fx.channelId,
          customerNotes: 'Un soporte para auriculares con mi nombre grabado.',
          webQuoteRequestId,
          items: [
            {
              type: 'ADHOC',
              description: 'Soporte de auriculares',
              quantity: 1,
              payload: {
                pieces: [
                  { name: 'Soporte', grams: 60, printMinutes: 120, filamentId: fx.filamentId },
                ],
                materials: [],
                assemblyMinutes: 5,
                managementMinutes: 5,
              },
            },
          ],
        });

    const created = await quote(id).expect(201);
    expect(created.body.code).toMatch(/^R-\d{4}-\d{4}$/);
    expect(await prisma.quote.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({
      customerId,
    });
    const detail = await get(`/${id}`).expect(200);
    expect(detail.body).toMatchObject({
      status: 'QUOTED',
      quoteCode: created.body.code,
      quote: { id: created.body.id, code: created.body.code },
    });

    // Una sola cotización por solicitud, y sin gastar un código.
    await quote(id).expect(409);
    expect(await prisma.quote.count()).toBe(1);
    await quote('no-existe').expect(404);
  });

  it('sin ecommerce:orders no se ve nada', async () => {
    const id = await receive();
    const other = firmar(['quote:read']);
    await get('', other).expect(403);
    await get(`/${id}/attachment`, other).expect(403);
  });
});
