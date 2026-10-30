import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MaterialType, MaterialUnit } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { StorefrontOrdersService } from '@/modules/storefront-integration/storefront-orders.service';
import { WebColorOptionsService } from '@/modules/web-catalog/web-color-options.service';
import { WebProductsService } from '@/modules/web-catalog/web-products.service';
import { WebPublicationService } from '@/modules/web-catalog/web-publication.service';
import { WebVariantsService } from '@/modules/web-catalog/web-variants.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F14·7: desde un ítem del pedido se genera su orden de producción, con el
 * color que eligió el cliente en cada pieza que pinta su opción de color.
 */
describe('[int] Orden de producción desde un pedido web', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixtures;
  let token: string;
  let marron: string;
  let pieceId: string;
  /** La variante Marrón, con su precio de la vista. */
  let variant: { id: string; price_cents: number };

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
    token = firmar([
      'ecommerce:orders',
      'ecommerce:payments',
      'production:read',
      'production:execute',
    ]);

    const colors: Record<string, string> = {};
    for (const [nombre, hex] of [
      ['Negro', '#111111'],
      ['Marrón', '#8B5A2B'],
    ]) {
      colors[nombre!] = (
        await prisma.material.create({
          data: {
            name: `PLA ${nombre}`,
            color: nombre,
            colorHex: hex,
            type: MaterialType.FILAMENT,
            unit: MaterialUnit.KG,
            parentId: fx.filamentId,
          },
        })
      ).id;
    }
    marron = colors['Marrón']!;
    pieceId = (await prisma.productPiece.findFirstOrThrow({ where: { productId: fx.productId } }))
      .id;

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
    await app
      .get(WebColorOptionsService)
      .set(
        pubId,
        [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: Object.values(colors) }],
        fx.userId,
      );
    await app.get(WebVariantsService).regenerate(pubId, fx.userId);
    await prisma.webImage.create({
      data: { webProductId: pubId, path: 'catalog/x.webp', width: 10, height: 10 },
    });
    await app.get(WebPublicationService).publish(pubId, fx.userId);
    const rows = await prisma.$queryRaw<Array<{ id: string; price_cents: number }>>`
      SELECT v.id, v.price_cents FROM storefront_v1.variants v
      JOIN web_variant_selections s ON s."variantId" = v.id
      WHERE s."materialId" = ${marron}`;
    variant = rows[0]!;
  });

  /** Una Trapecio Marrón por transferencia, como la registra el sitio (F14·3). */
  const place = async (quantity = 2) =>
    (
      await app.get(StorefrontOrdersService).place({
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
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'AWAITING_TRANSFER',
        deliveryMethod: 'PICKUP',
        shipping: null,
        shippingLabel: 'Retiro por el taller',
        shippingCents: 0,
        subtotalCents: variant.price_cents * quantity,
        totalCents: variant.price_cents * quantity,
        customerNote: '',
        placedAt: new Date('2026-10-29T15:00:00Z'),
        items: [
          {
            webVariantId: variant.id,
            quantity,
            unitPriceCents: variant.price_cents,
            productName: 'Lámpara Trapecio',
            variantLabel: '280 · Marrón',
            selections: [],
          },
        ],
      })
    ).webOrderId;

  const http = () => request(app.getHttpServer());
  const itemOf = (orderId: string) =>
    prisma.webOrderItem.findFirstOrThrow({ where: { webOrderId: orderId } });
  const generate = (orderId: string, itemId: string, quantity = 2, auth = token) =>
    http()
      .post(`/web-orders/${orderId}/items/${itemId}/production-order`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ quantity });
  /** La transferencia acreditada, con su monto y la operación (F22·3). */
  const pay = async (orderId: string) => {
    const { totalCents } = await prisma.webOrder.findUniqueOrThrow({ where: { id: orderId } });
    return http()
      .post(`/web-orders/${orderId}/confirm-transfer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountCents: totalCents, operationNumber: 'OP-1' })
      .expect(201);
  };

  it('el plan muestra el color elegido en cada pieza', async () => {
    const id = await place();
    const item = await itemOf(id);
    const plan = await http()
      .get(`/web-orders/${id}/items/${item.id}/production-plan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(plan.body).toMatchObject({
      productId: fx.productId,
      quantity: 2,
      suggestedQuantity: 2,
      pieces: [{ pieceId, pieceName: 'Cuerpo', colorName: 'Marrón', colorHex: '#8B5A2B' }],
      missing: [],
    });
  });

  it('genera la orden con el color en la pieza y la vincula al ítem, una sola vez', async () => {
    const id = await place();
    const item = await itemOf(id);
    // Sin pago no se fabrica.
    await generate(id, item.id).expect(422);

    await pay(id);
    const res = await generate(id, item.id).expect(201);
    const linked = res.body.items[0];
    expect(linked.productionOrderCode).toMatch(/^OP-/);

    const production = await prisma.productionOrder.findUniqueOrThrow({
      where: { id: linked.productionOrderId },
    });
    expect(production).toMatchObject({
      productId: fx.productId,
      status: 'PLANNED',
      filamentOverrides: { [pieceId]: marron },
    });
    expect(Number(production.quantity)).toBe(2);
    expect(production.notes).toContain(res.body.code);
    expect(res.body.events[0].message).toBe(
      `Orden de producción ${production.code}: Lámpara Trapecio × 2`,
    );
    expect(
      await prisma.auditLog.count({ where: { entity: 'WebOrder', action: 'production-order' } }),
    ).toBe(1);

    await generate(id, item.id).expect(409);
    expect(await prisma.productionOrder.count()).toBe(1);
  });

  it('sin permiso de producción no se genera', async () => {
    const id = await place();
    const item = await itemOf(id);
    await pay(id);
    await generate(id, item.id, 2, firmar(['ecommerce:orders'])).expect(403);
    expect(await prisma.productionOrder.count()).toBe(0);
  });
});
