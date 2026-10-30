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
import { StorefrontPaymentsClient, type PaymentsReadiness } from './storefront-payments.client';

/**
 * F22·2: un switch por medio de pago, con su propio permiso. Un medio en línea
 * solo se prende si el sitio tiene sus credenciales; el efectivo, solo con retiro.
 */
describe('[int] Medios de pago de la tienda', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let readiness: PaymentsReadiness;
  let asked = 0;

  const valid = {
    cashEnabled: false,
    bankTransferEnabled: true,
    bankTransferInstructions: 'Alias: plastik.tienda',
    mercadoPagoEnabled: true,
    modoEnabled: false,
    goCuotasEnabled: false,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorefrontPaymentsClient)
      .useValue({
        readiness: () => {
          asked++;
          return Promise.resolve(readiness);
        },
      })
      .compile();
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
    await prisma.outboxEvent.deleteMany();
    const fx = await seedFixtures(prisma);
    token = firmar(fx.userId, ['ecommerce:read', 'ecommerce:settings', 'ecommerce:payments']);
    readiness = { MERCADOPAGO: 'ready', MODO: 'missing', GOCUOTAS: 'missing' };
    asked = 0;
  });

  const http = () => request(app.getHttpServer());
  const put = (body: unknown, auth = token) =>
    http()
      .put('/web-catalog/settings/payments')
      .set('Authorization', `Bearer ${auth}`)
      .send(body as object);

  it('sin nada guardado: Mercado Pago prendido, lo demás apagado, y lo que dice el sitio', async () => {
    const res = await http()
      .get('/web-catalog/settings/payments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      cashEnabled: false,
      bankTransferEnabled: false,
      mercadoPagoEnabled: true,
      modoEnabled: false,
      goCuotasEnabled: false,
      pickupEnabled: true,
      readiness: { MERCADOPAGO: 'ready', MODO: 'missing', GOCUOTAS: 'missing' },
      updatedAt: null,
    });
  });

  it('guarda, avisa al sitio, queda en auditoría y la vista lo muestra', async () => {
    const res = await put({ ...valid, cashEnabled: true }).expect(200);
    expect(res.body).toMatchObject({ ...valid, cashEnabled: true });

    expect(await prisma.outboxEvent.count({ where: { type: 'catalog.changed' } })).toBeGreaterThan(
      0,
    );
    expect(await prisma.auditLog.count({ where: { entity: 'EcommercePayments' } })).toBe(1);
    const [view] = await prisma.$queryRaw<
      Array<{
        cash_enabled: boolean;
        bank_transfer_enabled: boolean;
        mercadopago_enabled: boolean;
        modo_enabled: boolean;
        gocuotas_enabled: boolean;
      }>
    >`SELECT cash_enabled, bank_transfer_enabled, mercadopago_enabled, modo_enabled, gocuotas_enabled
      FROM storefront_v1.store_settings`;
    expect(view).toEqual({
      cash_enabled: true,
      bank_transfer_enabled: true,
      mercadopago_enabled: true,
      modo_enabled: false,
      gocuotas_enabled: false,
    });
  });

  it('un medio en línea sin credenciales en el sitio no se prende', async () => {
    const sin = await put({ ...valid, modoEnabled: true }).expect(422);
    expect(sin.body.details).toMatchObject({ reason: 'MISSING_CREDENTIALS', method: 'MODO' });

    readiness = { MERCADOPAGO: 'unknown', MODO: 'unknown', GOCUOTAS: 'unknown' };
    const caido = await put({ ...valid, goCuotasEnabled: true }).expect(422);
    expect(caido.body.details).toMatchObject({
      reason: 'STOREFRONT_UNREACHABLE',
      method: 'GOCUOTAS',
    });
    expect(await prisma.ecommerceSettings.count()).toBe(0);
  });

  it('con las credenciales, se prende; y lo ya prendido no vuelve a preguntar', async () => {
    readiness = { MERCADOPAGO: 'ready', MODO: 'ready', GOCUOTAS: 'ready' };
    await put({ ...valid, modoEnabled: true, goCuotasEnabled: true }).expect(200);

    // Con el sitio caído se puede seguir editando lo demás.
    readiness = { MERCADOPAGO: 'unknown', MODO: 'unknown', GOCUOTAS: 'unknown' };
    asked = 0;
    await put({
      ...valid,
      modoEnabled: true,
      goCuotasEnabled: true,
      bankTransferInstructions: 'Alias: plastik.nuevo',
    }).expect(200);
    // Solo la consulta para devolver el estado, no para validar.
    expect(asked).toBe(1);
  });

  it('si cambian los datos para transferir, la tienda se entera (F22·3)', async () => {
    const avisos = () =>
      prisma.outboxEvent.findMany({ where: { type: 'store.bank_details_changed' } });
    await put(valid).expect(200);
    expect(await avisos()).toHaveLength(1);
    // Guardar lo mismo, o cambiar otra cosa, no avisa.
    await put({ ...valid, cashEnabled: true }).expect(200);
    expect(await avisos()).toHaveLength(1);

    await put({ ...valid, bankTransferInstructions: 'Alias: otra.cuenta' }).expect(200);
    const sent = await avisos();
    expect(sent).toHaveLength(2);
    expect(sent[1]!.payload).toMatchObject({
      changedAt: expect.any(String),
      changedBy: expect.any(String),
    });
  });

  it('el efectivo es solo con retiro', async () => {
    await prisma.ecommerceSettings.create({
      data: { id: 1, pickupEnabled: false, shippingFlatRate: 4500 },
    });
    const res = await put({ ...valid, cashEnabled: true }).expect(422);
    expect(res.body.details).toMatchObject({ reason: 'CASH_NEEDS_PICKUP' });
  });

  it('transferencia sin datos para pagar no se guarda', async () => {
    const res = await put({ ...valid, bankTransferInstructions: '' }).expect(400);
    const issues = (res.body as { details: { issues: Array<{ path: string }> } }).details.issues;
    expect(issues.map((i) => i.path)).toContain('bankTransferInstructions');
  });

  it('sin el permiso ecommerce:payments no se ve ni se cambia', async () => {
    const soloAjustes = firmar('u-otro', ['ecommerce:read', 'ecommerce:settings']);
    await put(valid, soloAjustes).expect(403);
    await http()
      .get('/web-catalog/settings/payments')
      .set('Authorization', `Bearer ${soloAjustes}`)
      .expect(403);
  });
});
