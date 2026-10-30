import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { WebAvailability } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { StorefrontOrdersService } from '@/modules/storefront-integration/storefront-orders.service';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { WebPublicationService } from '@/modules/web-catalog/web-publication.service';
import { WebVariantsService } from '@/modules/web-catalog/web-variants.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';
import { WebOrderDeadlinesService } from './web-order-deadlines.service';

/**
 * F22·4: los pedidos sin pagar vencen solos. Efectivo y transferencia: 48 h,
 * con aviso 24 h antes; en línea: 2 h. Al vencer se cancelan y el stock vuelve.
 * El reloj se pasa a mano.
 */
describe('[int] Plazo para pagar los pedidos web', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixtures;
  let token: string;
  let variantId: string;
  let deadlines: WebOrderDeadlinesService;
  const placedAt = new Date('2026-10-29T15:00:00Z');
  const at = (hours: number) => new Date(placedAt.getTime() + hours * 60 * 60 * 1000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    deadlines = app.get(WebOrderDeadlinesService);
  });

  afterAll(async () => {
    await app.close();
  });

  const firmar = (permissions: string[]) =>
    app
      .get(JwtService)
      .sign({ sub: fx.userId, email: 'test@plastik.local', role: 'admin', permissions });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.outboxEvent.deleteMany();
    fx = await seedFixtures(prisma);
    token = firmar(['ecommerce:read', 'ecommerce:orders', 'ecommerce:payments']);
    const pubId = (
      await app.get(WebProductsService).create(
        {
          name: 'Lámpara Trapecio',
          description: 'Lámpara de mesa.',
          members: [{ productId: fx.productId, valueLabel: '280' }],
        },
        fx.userId,
      )
    ).id;
    await app.get(WebVariantsService).regenerate(pubId, fx.userId);
    await prisma.webImage.create({
      data: { webProductId: pubId, path: 'catalog/x.webp', width: 10, height: 10 },
    });
    await app.get(WebPublicationService).publish(pubId, fx.userId);
    const [variant] = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM storefront_v1.variants`;
    variantId = variant!.id;
    await prisma.webVariant.update({
      where: { id: variantId },
      data: { availability: WebAvailability.STOCK_ONLY, stockQuantity: 5 },
    });
  });

  const place = async (method: 'BANK_TRANSFER' | 'CASH' | 'MERCADOPAGO') => {
    const [row] = await prisma.$queryRaw<Array<{ price_cents: number }>>`
      SELECT price_cents FROM storefront_v1.variants WHERE id = ${variantId}`;
    const price = row!.price_cents;
    return app.get(StorefrontOrdersService).place({
      externalId: randomUUID(),
      number: 1001,
      customer: {
        externalId: 'web-ana',
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'Prueba',
        phone: '',
        documentNumber: null,
      },
      paymentMethod: method,
      paymentStatus:
        method === 'BANK_TRANSFER'
          ? 'AWAITING_TRANSFER'
          : method === 'CASH'
            ? 'AWAITING_CASH'
            : 'PENDING',
      deliveryMethod: 'PICKUP',
      shipping: null,
      shippingLabel: 'Retiro por el taller',
      shippingCents: 0,
      subtotalCents: price,
      totalCents: price,
      customerNote: '',
      placedAt,
      items: [
        {
          webVariantId: variantId,
          quantity: 1,
          unitPriceCents: price,
          productName: 'Lámpara Trapecio',
          variantLabel: '280',
          selections: [],
        },
      ],
    });
  };

  const order = (id: string) => prisma.webOrder.findUniqueOrThrow({ where: { id } });
  const stock = async () =>
    (await prisma.webVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQuantity;
  const sent = (type: string) => prisma.outboxEvent.findMany({ where: { type } });
  const post = (path: string, auth = token) =>
    request(app.getHttpServer()).post(`/web-orders${path}`).set('Authorization', `Bearer ${auth}`);

  it('efectivo y transferencia tienen 48 h; en línea, 2 h', async () => {
    const transfer = await place('BANK_TRANSFER');
    const cash = await place('CASH');
    const online = await place('MERCADOPAGO');
    expect(transfer.paymentDueAt).toBe(at(48).toISOString());
    expect(cash.paymentDueAt).toBe(at(48).toISOString());
    expect(online.paymentDueAt).toBe(at(2).toISOString());
    // Repetir el registro devuelve el mismo plazo.
    expect((await order(transfer.webOrderId)).paymentDueAt).toEqual(at(48));
  });

  it('avisa una sola vez 24 h antes, solo en efectivo y transferencia', async () => {
    const transfer = await place('BANK_TRANSFER');
    await place('MERCADOPAGO');
    expect(await deadlines.remindDue(at(23))).toBe(0);
    expect(await deadlines.remindDue(at(25))).toBe(1);
    expect(await deadlines.remindDue(at(30))).toBe(0);
    const [reminder] = await sent('order.payment_reminder');
    expect(reminder!.payload).toMatchObject({
      externalId: (await order(transfer.webOrderId)).externalId,
      paymentDueAt: at(48).toISOString(),
    });
  });

  it('al vencer se cancela, vuelve el stock y el sitio se entera; lo pagado no', async () => {
    const transfer = await place('BANK_TRANSFER');
    const paid = await place('CASH');
    const online = await place('MERCADOPAGO');
    await post(`/${paid.webOrderId}/confirm-cash`)
      .send({ amountCents: (await order(paid.webOrderId)).totalCents })
      .expect(201);
    expect(await stock()).toBe(2);

    expect(await deadlines.expireDue(at(1))).toBe(0);
    expect(await deadlines.expireDue(at(3))).toBe(1);
    expect((await order(online.webOrderId)).fulfillmentStatus).toBe('CANCELLED');
    expect(await deadlines.expireDue(at(49))).toBe(1);

    const cancelled = await order(transfer.webOrderId);
    expect(cancelled).toMatchObject({
      fulfillmentStatus: 'CANCELLED',
      cancelReason: 'Venció el plazo para pagar',
    });
    expect((await order(paid.webOrderId)).fulfillmentStatus).toBe('RECEIVED');
    expect(await stock()).toBe(4);
    const changes = await sent('order.fulfillment_changed');
    expect(changes.map((e) => (e.payload as { status: string }).status)).toEqual([
      'CANCELLED',
      'CANCELLED',
    ]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'WebOrder', action: 'cancelled', entityId: transfer.webOrderId },
    });
    expect(audit.actorId).toBeNull();
  });

  it('el admin da 48 h más: vuelve a avisar y el sitio ve el plazo nuevo', async () => {
    const transfer = await place('BANK_TRANSFER');
    await deadlines.remindDue(at(25));
    const res = await post(`/${transfer.webOrderId}/extend-payment`).expect(201);
    expect(new Date(res.body.paymentDueAt).getTime()).toBeGreaterThanOrEqual(at(96).getTime());
    expect(res.body.events[0].message).toMatch(/^Plazo para pagar extendido hasta el /);
    const extended = await order(transfer.webOrderId);
    expect(extended.paymentReminderAt).toBeNull();
    const [changed] = await sent('order.payment_deadline_changed');
    expect(changed!.payload).toMatchObject({
      paymentDueAt: extended.paymentDueAt!.toISOString(),
    });
    expect(
      await prisma.auditLog.count({ where: { entity: 'WebOrder', action: 'payment-extended' } }),
    ).toBe(1);
    // A las 49 h ya no vence.
    expect(await deadlines.expireDue(at(49))).toBe(0);
  });

  it('extender pide el permiso de pagos y un pedido sin pagar', async () => {
    const transfer = await place('BANK_TRANSFER');
    const soloPedidos = firmar(['ecommerce:read', 'ecommerce:orders']);
    await post(`/${transfer.webOrderId}/extend-payment`, soloPedidos).expect(403);
    await post(`/${transfer.webOrderId}/confirm-transfer`)
      .send({
        amountCents: (await order(transfer.webOrderId)).totalCents,
        operationNumber: 'OP-1',
      })
      .expect(201);
    await post(`/${transfer.webOrderId}/extend-payment`).expect(422);
  });
});
