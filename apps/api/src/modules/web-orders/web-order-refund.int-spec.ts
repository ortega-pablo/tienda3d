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
import {
  StorefrontOrderEventsService,
  webOrderEventSchema,
} from '@/modules/storefront-integration/storefront-order-events.service';
import { StorefrontOrdersService } from '@/modules/storefront-integration/storefront-orders.service';
import { StorefrontPaymentsClient } from '@/modules/web-catalog/storefront-payments.client';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { WebPublicationService } from '@/modules/web-catalog/web-publication.service';
import { WebVariantsService } from '@/modules/web-catalog/web-variants.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';
import { WebOrderDeadlinesService } from './web-order-deadlines.service';
import { WebOrdersService } from './web-orders.service';

/**
 * F22·5: el pago lo maneja el sitio, pero el panel reembolsa, frena lo que tiene
 * un contracargo y muestra lo que hay que mirar. El sitio está reemplazado.
 */
describe('[int] Reembolsos y contracargos de los pedidos web', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixtures;
  let token: string;
  let variantId: string;
  const storefront = {
    readiness: jest.fn(),
    refund: jest.fn(),
    reconcile: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorefrontPaymentsClient)
      .useValue(storefront)
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

  const firmar = (permissions: string[]) =>
    app
      .get(JwtService)
      .sign({ sub: fx.userId, email: 'test@plastik.local', role: 'admin', permissions });

  beforeEach(async () => {
    jest.resetAllMocks();
    storefront.refund.mockResolvedValue({ ok: true, refundedCents: 1000 });
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

  const place = async (method: 'BANK_TRANSFER' | 'MERCADOPAGO') => {
    const [row] = await prisma.$queryRaw<Array<{ price_cents: number }>>`
      SELECT price_cents FROM storefront_v1.variants WHERE id = ${variantId}`;
    const price = row!.price_cents;
    const externalId = randomUUID();
    const placed = await app.get(StorefrontOrdersService).place({
      externalId,
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
      paymentStatus: method === 'BANK_TRANSFER' ? 'AWAITING_TRANSFER' : 'PENDING',
      deliveryMethod: 'PICKUP',
      shipping: null,
      shippingLabel: 'Retiro por el taller',
      shippingCents: 0,
      subtotalCents: price,
      totalCents: price,
      customerNote: '',
      placedAt: new Date(),
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
    return { id: placed.webOrderId, externalId };
  };

  let clock = Date.parse('2026-10-30T15:00:00Z');
  /** Un aviso del sitio: cada uno, un poco más nuevo que el anterior. */
  const payment = (
    externalId: string,
    paymentStatus: 'APPROVED' | 'DISPUTED' | 'REFUNDED',
    refundedCents = 0,
  ) => {
    clock += 1000;
    return app.get(StorefrontOrderEventsService).apply(
      externalId,
      {
        type: 'payment_updated',
        paymentStatus,
        paidAt: new Date(clock),
        refundedCents,
        changedAt: new Date(clock),
      },
      randomUUID(),
    );
  };

  const post = (path: string, auth = token) =>
    request(app.getHttpServer()).post(`/web-orders${path}`).set('Authorization', `Bearer ${auth}`);
  const detail = (id: string) => app.get(WebOrdersService).get(id);

  it('reembolsa con el permiso de pagos: el sitio lo hace y queda registrado', async () => {
    const order = await place('MERCADOPAGO');
    await payment(order.externalId, 'APPROVED');
    expect((await detail(order.id)).actions.refund).toBe(true);

    const res = await post(`/${order.id}/refund`)
      .send({ amountCents: 1000, reason: 'Faltó una pieza' })
      .expect(201);

    expect(storefront.refund).toHaveBeenCalledWith({
      externalId: order.externalId,
      amountCents: 1000,
      reason: 'Faltó una pieza',
      requestedBy: expect.any(String),
    });
    expect(res.body.events[0].message).toMatch(/^Reembolso de .*10,00: Faltó una pieza$/);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'WebOrder', action: 'refund', entityId: order.id },
    });
    expect(audit.actorId).toBe(fx.userId);
  });

  it('sin monto devuelve lo que queda; el motivo es obligatorio', async () => {
    const order = await place('MERCADOPAGO');
    await payment(order.externalId, 'APPROVED');
    await post(`/${order.id}/refund`).send({ reason: 'Se arrepintió' }).expect(201);
    expect(storefront.refund.mock.calls[0][0]).not.toHaveProperty('amountCents');
    await post(`/${order.id}/refund`).send({ amountCents: 100 }).expect(400);
  });

  it('pide el permiso de pagos y un pago en línea acreditado', async () => {
    const online = await place('MERCADOPAGO');
    const body = { reason: 'Prueba' };
    await post(`/${online.id}/refund`).send(body).expect(422);
    await payment(online.externalId, 'APPROVED');
    await post(`/${online.id}/refund`, firmar(['ecommerce:read', 'ecommerce:orders']))
      .send(body)
      .expect(403);

    const transfer = await place('BANK_TRANSFER');
    await payment(transfer.externalId, 'APPROVED');
    expect((await detail(transfer.id)).actions.refund).toBe(false);
    await post(`/${transfer.id}/refund`).send(body).expect(422);
    expect(storefront.refund).not.toHaveBeenCalled();
  });

  it('si el proveedor no lo hace, el admin lo ve y no queda como reembolsado', async () => {
    const order = await place('MERCADOPAGO');
    await payment(order.externalId, 'APPROVED');
    storefront.refund.mockResolvedValue({
      ok: false,
      reason: 'GATEWAY_ERROR',
      message: 'Mercado Pago no hizo el reembolso.',
    });
    const res = await post(`/${order.id}/refund`).send({ reason: 'Prueba' }).expect(422);
    expect(res.body.message).toBe('Mercado Pago no hizo el reembolso.');
    const { events } = await detail(order.id);
    expect(events.some((e) => e.message.startsWith('Reembolso de'))).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'refund' } })).toBe(0);
  });

  it('el sitio informa lo devuelto: lo parcial sigue pagado, lo total queda reembolsado', async () => {
    const order = await place('MERCADOPAGO');
    await payment(order.externalId, 'APPROVED');
    await payment(order.externalId, 'APPROVED', 1000);
    const partial = await detail(order.id);
    expect(partial).toMatchObject({ paymentStatus: 'APPROVED', refundedCents: 1000 });
    expect(partial.events[0]!.message).toMatch(/^Reembolsado hasta ahora: .*10,00$/);
    expect(partial.actions.refund).toBe(true);

    await payment(order.externalId, 'REFUNDED', partial.totalCents);
    const total = await detail(order.id);
    expect(total).toMatchObject({
      paymentStatus: 'REFUNDED',
      refundedCents: partial.totalCents,
    });
    expect(total.actions.refund).toBe(false);
  });

  it('un contracargo frena lo que no salió del taller y pide atención', async () => {
    const order = await place('MERCADOPAGO');
    await payment(order.externalId, 'APPROVED');
    await post(`/${order.id}/fulfillment`).send({ status: 'PREPARING' }).expect(201);
    await payment(order.externalId, 'DISPUTED');

    const disputed = await detail(order.id);
    expect(disputed).toMatchObject({ paymentStatus: 'DISPUTED', needsAttention: true });
    expect(disputed.events[0]!.message).toBe('Contracargo: pago en disputa');
    expect(disputed.actions).toMatchObject({ fulfillment: [], production: false, refund: false });
    expect(disputed.actions.cancel).toBe(true);
    const res = await post(`/${order.id}/fulfillment`)
      .send({ status: 'READY_FOR_PICKUP' })
      .expect(422);
    expect(res.body.message).toMatch(/en disputa/);
    expect(await app.get(WebOrdersService).attentionCount()).toBe(1);
  });

  it('el contracargo ganado devuelve el pedido a la preparación', async () => {
    const order = await place('MERCADOPAGO');
    await payment(order.externalId, 'APPROVED');
    await payment(order.externalId, 'DISPUTED');
    await payment(order.externalId, 'APPROVED');
    expect((await detail(order.id)).actions.fulfillment).toEqual(['PREPARING']);
  });

  it('un pago tardío no reabre el pedido cancelado, y se puede devolver', async () => {
    const order = await place('MERCADOPAGO');
    await post(`/${order.id}/cancel`).send({ reason: 'Venció' }).expect(201);
    await payment(order.externalId, 'APPROVED');
    const late = await detail(order.id);
    expect(late).toMatchObject({ fulfillmentStatus: 'CANCELLED', paymentStatus: 'APPROVED' });
    expect(late.actions).toMatchObject({ fulfillment: [], cancel: false, refund: true });
  });

  it('una alerta del sitio va al historial una sola vez', async () => {
    const order = await place('MERCADOPAGO');
    const input = webOrderEventSchema.parse({
      type: 'payment_alert',
      alert: 'LATE_PAYMENT',
      message: 'Llegó el pago 123 con el pedido cancelado.',
      at: '2026-10-30T15:00:00Z',
    });
    const events = app.get(StorefrontOrderEventsService);
    const key = randomUUID();
    expect(await events.apply(order.externalId, input, key)).toMatchObject({
      applied: true,
      replayed: false,
    });
    expect(await events.apply(order.externalId, input, key)).toMatchObject({ replayed: true });
    expect(await events.apply(randomUUID(), input, randomUUID())).toMatchObject({
      ignored: 'UNKNOWN_ORDER',
    });
    const { events: history } = await detail(order.id);
    expect(history.filter((e) => e.kind === 'alert')).toHaveLength(1);
  });

  it('dispara la conciliación del sitio, aunque el sitio no responda', async () => {
    const deadlines = app.get(WebOrderDeadlinesService);
    storefront.reconcile.mockResolvedValue({ checked: 2, failed: 1 });
    await deadlines.reconcilePayments();
    storefront.reconcile.mockResolvedValue(null);
    await deadlines.reconcilePayments();
    expect(storefront.reconcile).toHaveBeenCalledTimes(2);
  });
});
