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

/**
 * F14·5: el admin gestiona los pedidos web. Cada acción respeta §5.6 (pagar
 * antes de preparar, la entrega define el camino, cancelar devuelve el stock)
 * y queda en el historial y en auditoría.
 */
describe('[int] Pedidos web en el panel', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixtures;
  let token: string;
  let variantId: string;

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
      data: { availability: WebAvailability.STOCK_ONLY, stockQuantity: 3 },
    });
  });

  /** Un pedido como lo registra el sitio (F14·3). */
  const place = async (
    over: {
      paymentMethod?: 'BANK_TRANSFER' | 'MERCADOPAGO' | 'CASH';
      documentNumber?: string;
      deliveryMethod?: 'PICKUP' | 'SHIPPING';
      quantity?: number;
      placedAt?: string;
      /** Otra clienta (por defecto, Ana). */
      who?: { externalId: string; email: string; firstName: string };
    } = {},
  ) => {
    const [row] = await prisma.$queryRaw<Array<{ price_cents: number }>>`
      SELECT price_cents FROM storefront_v1.variants WHERE id = ${variantId}`;
    const price_cents = row!.price_cents;
    const method = over.paymentMethod ?? 'BANK_TRANSFER';
    const quantity = over.quantity ?? 2;
    const placed = await app.get(StorefrontOrdersService).place({
      externalId: randomUUID(),
      number: 1001,
      customer: {
        externalId: over.who?.externalId ?? 'web-ana',
        email: over.who?.email ?? 'ana@example.com',
        firstName: over.who?.firstName ?? 'Ana',
        lastName: 'Prueba',
        phone: '',
        documentNumber: over.documentNumber ?? null,
      },
      paymentMethod: method,
      paymentStatus:
        method === 'BANK_TRANSFER'
          ? 'AWAITING_TRANSFER'
          : method === 'CASH'
            ? 'AWAITING_CASH'
            : 'PENDING',
      deliveryMethod: over.deliveryMethod ?? 'PICKUP',
      shipping:
        over.deliveryMethod === 'SHIPPING'
          ? {
              street: 'San Martín',
              number: '100',
              apartment: '',
              city: 'Mendoza',
              province: 'M',
              postalCode: '5500',
            }
          : null,
      shippingLabel: over.deliveryMethod === 'SHIPPING' ? 'Envío' : 'Retiro por el taller',
      shippingCents: 0,
      subtotalCents: price_cents * quantity,
      totalCents: price_cents * quantity,
      customerNote: '',
      placedAt: new Date(over.placedAt ?? '2026-10-29T15:00:00Z'),
      items: [
        {
          webVariantId: variantId,
          quantity,
          unitPriceCents: price_cents,
          productName: 'Lámpara Trapecio',
          variantLabel: '280',
          selections: [],
        },
      ],
    });
    return placed.webOrderId;
  };

  const http = () => request(app.getHttpServer());
  const get = (path: string, auth = token) =>
    http().get(`/web-orders${path}`).set('Authorization', `Bearer ${auth}`);
  const post = (path: string, body: object = {}) =>
    http().post(`/web-orders${path}`).set('Authorization', `Bearer ${token}`).send(body);
  /** Confirma la transferencia como lo hace el admin: el monto acreditado y la operación (F22·3). */
  const total = async (id: string) =>
    (await prisma.webOrder.findUniqueOrThrow({ where: { id } })).totalCents;
  const pay = async (id: string) =>
    await post(`/${id}/confirm-transfer`, {
      amountCents: await total(id),
      operationNumber: 'OP-4471',
    });
  const outboxClear = () => prisma.outboxEvent.deleteMany();
  const stock = async () =>
    (await prisma.webVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQuantity;
  const audits = (action: string) =>
    prisma.auditLog.count({ where: { entity: 'WebOrder', action, actorId: fx.userId } });

  it('lista, detalle y contador: la transferencia espera al taller', async () => {
    const id = await place();
    await place({ paymentMethod: 'MERCADOPAGO', quantity: 1 });

    const list = await get('').expect(200);
    expect(list.body).toHaveLength(2);
    expect((await get('/attention').expect(200)).body).toEqual({ count: 1 });
    const attention = await get('?attention=1').expect(200);
    expect(attention.body.map((o: { id: string }) => o.id)).toEqual([id]);

    const detail = await get(`/${id}`).expect(200);
    expect(detail.body).toMatchObject({
      code: expect.stringMatching(/^W-2026-\d{4}$/),
      customer: { name: 'Ana Prueba', email: 'ana@example.com' },
      paymentStatus: 'AWAITING_TRANSFER',
      fulfillmentStatus: 'RECEIVED',
      units: 2,
      items: [{ quantity: 2, reservedQuantity: 2 }],
      actions: { confirmTransfer: true, fulfillment: [], cancel: true },
    });
    expect(detail.body.events).toHaveLength(1);

    // El link del aviso a la tienda usa el código (F14·9).
    const byCode = await get(`/${detail.body.code}`).expect(200);
    expect(byCode.body.id).toBe(id);
  });

  it('filtra por pago, entrega y día de Argentina', async () => {
    await place({ placedAt: '2026-10-28T02:30:00Z' }); // 27/10 23:30 en Argentina
    await place({ paymentMethod: 'MERCADOPAGO', deliveryMethod: 'SHIPPING', quantity: 1 });
    const ids = async (q: string) => (await get(q).expect(200)).body.length;
    expect(await ids('?payment=PENDING')).toBe(1);
    expect(await ids('?delivery=SHIPPING')).toBe(1);
    expect(await ids('?from=2026-10-28')).toBe(1);
    expect(await ids('?to=2026-10-27')).toBe(1);
    expect(await ids('?from=2026-10-27&to=2026-10-29')).toBe(2);
    await get('?payment=NADA').expect(400);
  });

  it('sin pago no se prepara; con la transferencia confirmada, se sigue hasta entregar', async () => {
    const id = await place();
    const sinPago = await post(`/${id}/fulfillment`, { status: 'PREPARING' }).expect(422);
    expect(sinPago.body.message).toMatch(/todavía no está pagado/);

    const confirmed = await pay(id);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      paymentStatus: 'APPROVED',
      paidAt: expect.any(String),
      needsAttention: true,
      actions: { confirmTransfer: false, fulfillment: ['PREPARING'], cancel: true },
    });
    expect((await pay(id)).status).toBe(422);

    await post(`/${id}/fulfillment`, { status: 'PREPARING' }).expect(201);
    // Es retiro: no se envía.
    await post(`/${id}/fulfillment`, { status: 'SHIPPED' }).expect(422);
    await post(`/${id}/fulfillment`, { status: 'READY_FOR_PICKUP' }).expect(201);
    const done = await post(`/${id}/fulfillment`, { status: 'DELIVERED' }).expect(201);
    expect(done.body).toMatchObject({
      fulfillmentStatus: 'DELIVERED',
      actions: { confirmTransfer: false, fulfillment: [], cancel: false },
    });
    // El historial, del más nuevo al más viejo, con quién lo hizo.
    expect(done.body.events.map((e: { message: string }) => e.message)).toEqual([
      'Entregado',
      'Listo para retirar',
      'En preparación',
      expect.stringMatching(/^Transferencia confirmada: .* operación OP-4471$/),
      'Pedido #1001 recibido de la tienda',
    ]);
    expect(done.body.events[0].actorName).toEqual(expect.any(String));
    expect(await audits('transfer-confirmed')).toBe(1);
    expect(await audits('fulfillment-change')).toBe(3);
    // Lo entregado no devuelve stock.
    expect(await stock()).toBe(1);
  });

  it('el envío guarda el seguimiento', async () => {
    const id = await place({ deliveryMethod: 'SHIPPING' });
    expect((await pay(id)).status).toBe(201);
    await post(`/${id}/fulfillment`, { status: 'PREPARING' }).expect(201);
    await post(`/${id}/fulfillment`, { status: 'READY_FOR_PICKUP' }).expect(422);
    const shipped = await post(`/${id}/fulfillment`, {
      status: 'SHIPPED',
      trackingCode: 'AR123',
    }).expect(201);
    expect(shipped.body).toMatchObject({
      trackingCode: 'AR123',
      actions: { fulfillment: ['DELIVERED', 'PREPARING'], cancel: false },
    });
    expect(shipped.body.events[0].message).toBe('Enviado — seguimiento AR123');
  });

  it('cancelar pide el motivo, devuelve el stock y avisa al sitio', async () => {
    const id = await place();
    expect(await stock()).toBe(1);
    await prisma.outboxEvent.deleteMany();

    await post(`/${id}/cancel`, { reason: '' }).expect(400);
    const cancelled = await post(`/${id}/cancel`, { reason: 'No pagó' }).expect(201);
    expect(cancelled.body).toMatchObject({
      fulfillmentStatus: 'CANCELLED',
      cancelReason: 'No pagó',
      needsAttention: false,
      items: [{ reservedQuantity: 0 }],
      actions: { confirmTransfer: false, fulfillment: [], cancel: false },
    });
    expect(cancelled.body.events[0].message).toBe(
      'Cancelado: No pagó · 2 unidad(es) vuelven al stock',
    );
    expect(await stock()).toBe(3);
    expect(await prisma.outboxEvent.count({ where: { type: 'catalog.changed' } })).toBe(1);
    expect(await audits('cancelled')).toBe(1);

    // Una sola vez: no se devuelve el stock dos veces.
    await post(`/${id}/cancel`, { reason: 'Otra vez' }).expect(422);
    expect(await stock()).toBe(3);
  });

  it('cada cambio le llega al sitio por el outbox (F14·6)', async () => {
    const id = await place();
    const { externalId, code } = await prisma.webOrder.findUniqueOrThrow({ where: { id } });
    await prisma.outboxEvent.deleteMany();
    const sent = async () =>
      (await prisma.outboxEvent.findMany({ orderBy: { createdAt: 'asc' } })).map((e) => [
        e.type,
        e.payload,
      ]);

    expect((await pay(id)).status).toBe(201);
    await post(`/${id}/fulfillment`, { status: 'PREPARING' }).expect(201);
    await post(`/${id}/cancel`, { reason: 'Se arrepintió' }).expect(201);
    expect(await sent()).toEqual([
      [
        'order.payment_confirmed_manually',
        {
          externalId,
          code,
          paidAt: expect.any(String),
          method: 'BANK_TRANSFER',
          amountCents: expect.any(Number),
        },
      ],
      [
        'order.fulfillment_changed',
        { externalId, code, status: 'PREPARING', changedAt: expect.any(String) },
      ],
      // El motivo es interno: no viaja.
      [
        'order.fulfillment_changed',
        { externalId, code, status: 'CANCELLED', changedAt: expect.any(String) },
      ],
      // El stock devuelto cambia lo que muestra la tienda.
      ['catalog.changed', { scope: 'product', ids: [expect.any(String)] }],
    ]);
    // Un rechazo no avisa nada.
    await post(`/${id}/fulfillment`, { status: 'PREPARING' }).expect(422);
    expect(await prisma.outboxEvent.count()).toBe(4);
  });

  it('dos admins a la vez: el pago se confirma una sola vez', async () => {
    const id = await place();
    const results = await Promise.all([pay(id), pay(id)]);
    expect(results.map((r) => r.status).filter((s) => s === 201)).toHaveLength(1);
    expect([409, 422]).toContain(results.find((r) => r.status !== 201)!.status);
    expect(await prisma.webOrderEvent.count({ where: { webOrderId: id, kind: 'payment' } })).toBe(
      1,
    );
  });

  it('las notas internas se guardan y quedan en auditoría', async () => {
    const id = await place();
    const res = await http()
      .patch(`/web-orders/${id}/notes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ internalNotes: 'Avisó que retira el viernes.' })
      .expect(200);
    expect(res.body.internalNotes).toBe('Avisó que retira el viernes.');
    expect(await audits('notes')).toBe(1);
  });

  it('un cliente con dos compras las muestra a las dos (F14·8)', async () => {
    const first = await place({ quantity: 1 });
    const second = await place({ paymentMethod: 'MERCADOPAGO', quantity: 1 });
    await place({
      quantity: 1,
      who: { externalId: 'web-bea', email: 'bea@example.com', firstName: 'Bea' },
    });
    const ana = await prisma.customer.findUniqueOrThrow({ where: { externalId: 'web-ana' } });

    const orders = await get(`?customer=${ana.id}`).expect(200);
    expect(orders.body.map((o: { id: string }) => o.id).sort()).toEqual([first, second].sort());

    const customers = await http()
      .get('/customers')
      .set('Authorization', `Bearer ${firmar(['customer:read'])}`)
      .expect(200);
    const count = (email: string) =>
      customers.body.find((c: { email: string }) => c.email === email)?.webOrderCount;
    expect(count('ana@example.com')).toBe(2);
    expect(count('bea@example.com')).toBe(1);
  });

  it('confirmar una transferencia pide el monto acreditado y la operación (F22·3)', async () => {
    const id = await place();
    await outboxClear();
    await post(`/${id}/confirm-transfer`, {}).expect(400);
    const distinto = await post(`/${id}/confirm-transfer`, {
      amountCents: (await total(id)) - 100,
      operationNumber: 'OP-1',
    }).expect(422);
    expect(distinto.body.details).toMatchObject({ reason: 'AMOUNT_MISMATCH' });
    expect((await get(`/${id}`).expect(200)).body.paymentStatus).toBe('AWAITING_TRANSFER');

    const ok = await pay(id);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      paymentStatus: 'APPROVED',
      paidAmountCents: await total(id),
      paymentReference: 'OP-4471',
    });
    expect(ok.body.events[0].message).toMatch(/Transferencia confirmada: .* operación OP-4471/);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'WebOrder', action: 'transfer-confirmed', entityId: id },
    });
    expect(audit.after).toMatchObject({ amountCents: await total(id), reference: 'OP-4471' });
    const sent = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'order.payment_confirmed_manually' },
    });
    expect(sent.payload).toMatchObject({ method: 'BANK_TRANSFER', amountCents: await total(id) });
  });

  it('el efectivo se cobra al retirar, con el monto exacto y el documento a la vista (F22·3)', async () => {
    const id = await place({ paymentMethod: 'CASH', documentNumber: '30123456' });
    await outboxClear();
    const detail = (await get(`/${id}`).expect(200)).body;
    expect(detail).toMatchObject({
      paymentStatus: 'AWAITING_CASH',
      customer: { document: '30123456' },
      actions: { confirmTransfer: false, confirmCash: true, fulfillment: [] },
    });
    expect((await pay(id)).status).toBe(422);
    await post(`/${id}/confirm-cash`, { amountCents: 100 }).expect(422);

    const ok = await post(`/${id}/confirm-cash`, { amountCents: await total(id) }).expect(201);
    expect(ok.body).toMatchObject({
      paymentStatus: 'APPROVED',
      paidAmountCents: await total(id),
      paymentReference: null,
      actions: { confirmCash: false },
    });
    expect(await audits('cash-confirmed')).toBe(1);
    const sent = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'order.payment_confirmed_manually' },
    });
    expect(sent.payload).toMatchObject({ method: 'CASH', amountCents: await total(id) });
  });

  it('sin ecommerce:payments se gestiona el pedido pero no se confirma un cobro (F22·3)', async () => {
    const transferencia = await place({ quantity: 1 });
    const efectivo = await place({ paymentMethod: 'CASH', quantity: 1 });
    const soloPedidos = firmar(['ecommerce:read', 'ecommerce:orders']);
    await get(`/${transferencia}`, soloPedidos).expect(200);
    await http()
      .post(`/web-orders/${transferencia}/confirm-transfer`)
      .set('Authorization', `Bearer ${soloPedidos}`)
      .send({ amountCents: await total(transferencia), operationNumber: 'OP-1' })
      .expect(403);
    await http()
      .post(`/web-orders/${efectivo}/confirm-cash`)
      .set('Authorization', `Bearer ${soloPedidos}`)
      .send({ amountCents: await total(efectivo) })
      .expect(403);
  });

  it('sin ecommerce:orders no se ve ni se toca nada', async () => {
    const id = await place();
    const lector = firmar(['ecommerce:read']);
    await get('', lector).expect(403);
    await get(`/${id}`, lector).expect(403);
    await http()
      .post(`/web-orders/${id}/confirm-transfer`)
      .set('Authorization', `Bearer ${lector}`)
      .expect(403);
  });
});
