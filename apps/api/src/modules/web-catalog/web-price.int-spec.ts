import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PricingService } from '@/modules/pricing/pricing.service';
import { WebPriceService } from './web-price.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F7·1: el precio publicado es el de Venta Directa a cliente normal, cantidad
 * 1: el mismo que muestra `GET /products/:id/prices` (PricingService.forProduct).
 */
describe('[int] Precio web = Venta Directa', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let pricing: PricingService;
  let service: WebPriceService;
  let close: () => Promise<void>;
  let fx: Fixtures;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    pricing = moduleRef.get(PricingService);
    service = moduleRef.get(WebPriceService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
  });

  /** Lo que el panel de precios del editor muestra para Venta Directa, cantidad 1. */
  const panelDirecta = async (productId: string) => {
    const { channels } = await pricing.forProduct(productId);
    const block = channels.find((c) => c.channelId === fx.channelId)!;
    return (block.base ?? block.tiers.find((t) => t.minQty === 1)!.line).finalPrice;
  };

  const producto = (sku: string, categoryId: string, extra: object = {}) =>
    prisma.product.create({
      data: {
        name: sku,
        sku,
        categoryId,
        pieces: {
          create: [
            { name: 'Cuerpo', grams: 50, printMinutes: 90, defaultFilamentId: fx.filamentId },
          ],
        },
        channels: { create: [{ channelId: fx.channelId, isEnabled: true }] },
        ...extra,
      },
    });

  it('sin escalas: el precio base de la categoría', async () => {
    const computed = await service.computeFor(fx.productId);

    expect(computed.state).toBe('OK');
    expect(computed.price).toBe(await panelDirecta(fx.productId));
    // Redondeo hacia arriba a múltiplos de 50 (price_rounding_step).
    expect(computed.price! % 50).toBe(0);
  });

  it('con escalas: la de cantidad 1, no la de mayor volumen', async () => {
    const escalada = await prisma.category.create({
      data: {
        name: 'Con escalas',
        slug: 'con-escalas',
        priceTiers: {
          create: [
            { channelId: fx.channelId, minQty: 1, maxQty: 9, markupPct: 90 },
            { channelId: fx.channelId, minQty: 10, maxQty: null, markupPct: 40 },
          ],
        },
      },
    });
    const p = await producto('PTK-TEST-000010', escalada.id);

    const computed = await service.computeFor(p.id);
    expect(computed.price).toBe(await panelDirecta(p.id));

    const { channels } = await pricing.forProduct(p.id);
    const volumen = channels[0]!.tiers.find((t) => t.minQty === 10)!.line.finalPrice;
    expect(computed.price).toBeGreaterThan(volumen);
  });

  it('llavero: la banda de 1 a 4', async () => {
    await prisma.keychainScaleTier.createMany({
      data: [
        { minQty: 1, maxQty: 4, markupPct: 150, sortOrder: 1 },
        { minQty: 5, maxQty: 24, markupPct: 120, sortOrder: 2 },
        { minQty: 25, maxQty: null, markupPct: 100, sortOrder: 3 },
      ],
    });
    const llavero = await prisma.product.create({
      data: {
        name: 'Llavero',
        sku: 'PTK-TEST-000009',
        kind: 'KEYCHAIN',
        categoryId: fx.categoryId,
        pieces: {
          create: [
            {
              name: 'Individual',
              grams: 10,
              printMinutes: 30,
              defaultFilamentId: fx.filamentId,
              scope: 'INDIVIDUAL',
            },
            {
              name: 'Tanda de 5',
              grams: 40,
              printMinutes: 100,
              defaultFilamentId: fx.filamentId,
              scope: 'BATCH',
            },
          ],
        },
        channels: { create: [{ channelId: fx.channelId, isEnabled: true }] },
      },
    });

    const computed = await service.computeFor(llavero.id);
    expect(computed.state).toBe('OK');
    expect(computed.price).toBe(await panelDirecta(llavero.id));
  });

  it('sin Venta Directa o sin markup no hay precio, y dice por qué', async () => {
    const sinDirecta = await producto('PTK-TEST-000011', fx.categoryId, {
      channels: { create: [{ channelId: fx.channelId, isEnabled: false }] },
    });
    expect(await service.computeFor(sinDirecta.id)).toMatchObject({
      state: 'NO_PRICE',
      price: null,
      reason: expect.stringMatching(/Venta Directa deshabilitada/),
    });

    const sinMarkup = await prisma.category.create({
      data: { name: 'Sin markup', slug: 'sin-markup' },
    });
    const p = await producto('PTK-TEST-000012', sinMarkup.id);
    expect(await service.computeFor(p.id)).toMatchObject({
      state: 'NO_PRICE',
      reason: expect.stringMatching(/no tiene markup/),
    });
  });

  it('un costo imposible de calcular es un motivo, no un error', async () => {
    const sinFilamento = await prisma.product.create({
      data: {
        name: 'Sin filamento',
        sku: 'PTK-TEST-000013',
        categoryId: fx.categoryId,
        pieces: { create: [{ name: 'Suelta', grams: 5, printMinutes: 5 }] },
        channels: { create: [{ channelId: fx.channelId, isEnabled: true }] },
      },
    });
    expect(await service.computeFor(sinFilamento.id)).toMatchObject({
      state: 'NO_PRICE',
      reason: expect.stringMatching(/no tiene filamento/),
    });
  });

  it('guarda el precio, no reescribe si nada cambió y deja historial cuando cambia', async () => {
    expect(await service.refresh(fx.productId, 'alta')).toEqual({ changed: true });
    const primero = await prisma.webPrice.findUniqueOrThrow({ where: { productId: fx.productId } });
    expect(Number(primero.price)).toBe(await panelDirecta(fx.productId));

    expect(await service.refresh(fx.productId, 'sin cambios')).toEqual({ changed: false });
    const igual = await prisma.webPrice.findUniqueOrThrow({ where: { productId: fx.productId } });
    expect(igual.computedAt).toEqual(primero.computedAt);

    await prisma.category.update({ where: { id: fx.categoryId }, data: { baseMarkupPct: 120 } });
    expect(await service.refresh(fx.productId, 'markup de la categoría')).toEqual({
      changed: true,
    });

    const historial = await prisma.webPriceHistory.findMany({
      where: { productId: fx.productId },
      orderBy: { changedAt: 'asc' },
    });
    expect(historial.map((h) => h.cause)).toEqual(['alta', 'markup de la categoría']);
    expect(historial[1]!.previous!.equals(primero.price!)).toBe(true);
    expect(Number(historial[1]!.price)).toBeGreaterThan(Number(primero.price));
  });
});
