import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CustomerSource, CustomerType } from '@prisma/client';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  generateIntegrationKey,
  INTEGRATION_SCOPES,
} from '@/common/integration-auth/integration-keys';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { truncateAll } from '../../../test/harness';

/**
 * F13·8: cada cuenta del sitio aparece en Clientes del sistema; si el email ya
 * era de un cliente, queda vinculada a él (D4). Por HTTP, con la clave del sitio.
 */
describe('[int] Clientes de la tienda online', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.integrationClient.deleteMany();
    await prisma.inboundEvent.deleteMany();
    key = await issue([...INTEGRATION_SCOPES]);
  });

  const issue = async (scopes: string[]) => {
    const generated = generateIntegrationKey();
    await prisma.integrationClient.create({
      data: { name: 'storefront', keyHash: generated.hash, keyPrefix: generated.prefix, scopes },
    });
    return generated.key;
  };

  const ana = {
    externalId: 'web-ana',
    email: 'ana.prueba@example.com',
    firstName: 'Ana',
    lastName: 'Prueba',
    phone: '+54 9 261 555-0000',
    documentNumber: null,
  };

  const post = (body: object, idempotencyKey?: string, apiKey = key) => {
    const req = request(app.getHttpServer())
      .post('/integrations/storefront/v1/customers')
      .set('Authorization', `Bearer ${apiKey}`)
      .send(body);
    return idempotencyKey ? req.set('Idempotency-Key', idempotencyKey) : req;
  };

  it('crea un cliente estándar de origen web, una sola vez por llamada', async () => {
    const first = await post(ana, 'k1').expect(201);
    expect(first.body).toMatchObject({ linked: false, replayed: false });

    const again = await post(ana, 'k1').expect(201);
    expect(again.body).toEqual({ ...first.body, replayed: true });

    const customers = await prisma.customer.findMany();
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      name: 'Ana Prueba',
      type: CustomerType.STANDARD,
      source: CustomerSource.WEB,
      externalId: 'web-ana',
      email: 'ana.prueba@example.com',
      phone: '+54 9 261 555-0000',
    });
  });

  it('un cambio de datos en el sitio actualiza al cliente web', async () => {
    await post(ana, 'k1').expect(201);
    await post(
      { ...ana, lastName: 'Pérez', phone: '+54 9 261 444-1111', documentNumber: '30111222' },
      'k2',
    ).expect(201);
    expect(await prisma.customer.findFirstOrThrow()).toMatchObject({
      name: 'Ana Pérez',
      phone: '+54 9 261 444-1111',
      taxId: '30111222',
    });
  });

  it('si el email ya es de un cliente del sistema, lo vincula sin cambiar su tipo ni su nombre', async () => {
    const mayorista = await prisma.customer.create({
      data: { name: 'Librería Ana', type: CustomerType.WHOLESALE, email: 'Ana.Prueba@Example.com' },
    });

    const res = await post(ana, 'k1').expect(201);
    expect(res.body).toMatchObject({ customerId: mayorista.id, linked: true });
    expect(await prisma.customer.count()).toBe(1);

    // Los cambios posteriores tampoco lo renombran: solo completan lo que falta.
    await post({ ...ana, firstName: 'Otra' }, 'k2').expect(201);
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: mayorista.id } })).toMatchObject({
      name: 'Librería Ana',
      type: CustomerType.WHOLESALE,
      source: CustomerSource.SYSTEM,
      externalId: 'web-ana',
      phone: '+54 9 261 555-0000',
    });
  });

  it('pide Idempotency-Key, datos válidos y el alcance customers:write', async () => {
    await post(ana).expect(400);
    await post({ ...ana, email: 'no-es-un-email' }, 'k1').expect(400);
    const sinAlcance = await issue(['orders:write']);
    await post(ana, 'k1', sinAlcance).expect(403);
    expect(await prisma.customer.count()).toBe(0);
  });
});
