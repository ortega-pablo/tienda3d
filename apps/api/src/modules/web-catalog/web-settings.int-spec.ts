import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { seedFixtures, truncateAll } from '../../../test/harness';

/**
 * F5·8: las condiciones de venta se guardan en el sistema. Se prueba por HTTP
 * porque la validación (montos ≥ 0, email) está en el borde.
 */
describe('[int] PUT /web-catalog/settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const valid = {
    shippingFlatRate: 4500,
    freeShippingFrom: 60000.5,
    pickupEnabled: true,
    pickupInstructions: 'Retiro por Palermo, de lunes a viernes.',
    notificationEmail: 'pedidos@plastik.local',
  };

  beforeAll(async () => {
    // Un solo init, como aplicación HTTP (ver materials-query.int-spec.ts).
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

  const firmar = (userId: string, permissions: string[]) =>
    app
      .get(JwtService)
      .sign({ sub: userId, email: 'test@plastik.local', role: 'admin', permissions });

  beforeEach(async () => {
    await truncateAll(prisma);
    const fx = await seedFixtures(prisma);
    token = firmar(fx.userId, ['ecommerce:read', 'ecommerce:settings']);
  });

  const put = (body: unknown, auth = token) =>
    request(app.getHttpServer())
      .put('/web-catalog/settings')
      .set('Authorization', `Bearer ${auth}`)
      .send(body as object);

  it('sin nada guardado devuelve los valores por defecto', async () => {
    const res = await request(app.getHttpServer())
      .get('/web-catalog/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      pickupEnabled: true,
      updatedAt: null,
    });
  });

  it('guarda y devuelve lo guardado', async () => {
    const res = await put(valid).expect(200);
    expect(res.body).toMatchObject(valid);

    const leido = await request(app.getHttpServer())
      .get('/web-catalog/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(leido.body).toMatchObject(valid);
    expect(await prisma.ecommerceSettings.count()).toBe(1);

    // Guardar otra vez actualiza la misma fila.
    await put({ ...valid, shippingFlatRate: null, notificationEmail: '' }).expect(200);
    const fila = await prisma.ecommerceSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(fila.shippingFlatRate).toBeNull();
    expect(await prisma.auditLog.count({ where: { entity: 'EcommerceSettings' } })).toBe(2);
  });

  it.each([
    ['un monto negativo', { shippingFlatRate: -1 }, 'shippingFlatRate'],
    ['un monto con tres decimales', { freeShippingFrom: 10.005 }, 'freeShippingFrom'],
    ['un email inválido', { notificationEmail: 'pedidos@' }, 'notificationEmail'],
    ['sin retiro ni envío', { pickupEnabled: false, shippingFlatRate: null }, 'pickupEnabled'],
    ['un medio de pago (van aparte, F22·2)', { bankTransferEnabled: true }, ''],
  ])('rechaza %s', async (_caso, cambio, campo) => {
    const res = await put({ ...valid, ...cambio }).expect(400);
    if (campo) {
      const issues = (res.body as { details: { issues: Array<{ path: string }> } }).details.issues;
      expect(issues.map((i) => i.path)).toContain(campo);
    }
    expect(await prisma.ecommerceSettings.count()).toBe(0);
  });

  it('con el efectivo prendido no se puede apagar el retiro (F22·2)', async () => {
    await put(valid).expect(200);
    await prisma.ecommerceSettings.update({ where: { id: 1 }, data: { cashEnabled: true } });
    const res = await put({ ...valid, pickupEnabled: false }).expect(422);
    expect(res.body.details).toMatchObject({ reason: 'CASH_NEEDS_PICKUP' });
  });

  it('sin el permiso ecommerce:settings no se puede leer ni guardar', async () => {
    const sinPermiso = firmar('u-otro', ['ecommerce:read', 'ecommerce:write']);
    await put(valid, sinPermiso).expect(403);
    await request(app.getHttpServer())
      .get('/web-catalog/settings')
      .set('Authorization', `Bearer ${sinPermiso}`)
      .expect(403);
  });
});
