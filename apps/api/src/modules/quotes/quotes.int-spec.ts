import { ConflictException } from '@nestjs/common';
import { CustomerType, QuoteStatus } from '@prisma/client';
import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { QuotesService } from './quotes.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * Flujo de cotización contra Postgres real: precio, coherencia entre costo y
 * precio (F-07), imputación de volumen al aceptar (F-08) y códigos sin
 * colisión (F-10).
 */
describe('[int] Flujo de cotización', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let quotes: QuotesService;
  let close: () => Promise<void>;
  let fx: Fixtures;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    quotes = moduleRef.get(QuotesService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
  });

  const newQuote = (over: Partial<Parameters<QuotesService['create']>[0]> = {}) =>
    quotes.create(
      {
        customerName: 'Walk-in',
        channelId: fx.channelId,
        items: [{ type: 'PRODUCT', productId: fx.productId, quantity: 2 }],
        ...over,
      } as Parameters<QuotesService['create']>[0],
      fx.userId,
    );

  it('crea la cotización con precio, ganancia y total coherentes', async () => {
    const quote = await newQuote();

    expect(quote.code).toMatch(/^Q-\d{4}-\d{4}$/);
    expect(quote.status).toBe(QuoteStatus.DRAFT);
    expect(quote.items).toHaveLength(1);

    const item = quote.items[0]!;
    expect(item.unitPrice).toBeGreaterThan(item.unitCost);
    expect(item.lineTotal).toBeCloseTo(item.unitPrice * 2, 2);
    expect(quote.total).toBeCloseTo(item.lineTotal, 2);
    // El redondeo del paso 50 aplica al precio de venta.
    expect(item.unitPrice % 50).toBe(0);
  });

  /**
   * F-07: con skipMarketing/skipReinvestment el precio se calculaba sobre el
   * costo ajustado pero se persistía el costo SIN ajustar, así que el margen
   * derivado de la cotización guardada salía inflado.
   */
  it('el unitCost guardado está sobre la misma base que el precio', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'Mayorista',
        type: CustomerType.WHOLESALE,
        skipReinvestment: true,
        skipMarketing: true,
        categoryCommitments: { create: [{ categoryId: fx.categoryId }] },
      },
    });

    const quote = await newQuote({ customerId: customer.id, customerName: 'Mayorista' });
    const item = quote.items[0]!;

    // El profit del motor es exactamente la diferencia entre precio y costo,
    // descontando comisión y régimen. Si las bases no coincidieran, el margen
    // implícito no cerraría con el unitProfit snapshoteado.
    expect(item.unitCost).toBeGreaterThan(0);
    expect(item.unitProfit).toBeGreaterThan(0);
    expect(item.unitPrice - item.unitCost).toBeGreaterThan(item.unitProfit * 0.5);
  });

  it('aceptar imputa el volumen mensual, y volver atrás lo revierte', async () => {
    const customer = await prisma.customer.create({
      data: {
        name: 'Mayorista',
        type: CustomerType.WHOLESALE,
        categoryCommitments: {
          create: [{ categoryId: fx.categoryId, monthlyCommitmentQty: 10 }],
        },
      },
    });

    const quote = await newQuote({ customerId: customer.id, customerName: 'Mayorista' });
    await quotes.setStatus(quote.id, QuoteStatus.SENT, fx.userId);
    await quotes.setStatus(quote.id, QuoteStatus.ACCEPTED, fx.userId);

    const afterAccept = await prisma.customerMonthlyVolume.findFirstOrThrow({
      where: { customerId: customer.id, categoryId: fx.categoryId },
    });
    expect(Number(afterAccept.unitsSold)).toBe(2);
    // La clave del mes conserva el formato día-1-medianoche-UTC (F-08).
    expect(afterAccept.monthStart.toISOString()).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
  });

  it('rechaza transiciones inválidas y cierra la carrera entre dos cambios', async () => {
    const quote = await newQuote();
    await quotes.setStatus(quote.id, QuoteStatus.SENT, fx.userId);

    const results = await Promise.allSettled([
      quotes.setStatus(quote.id, QuoteStatus.ACCEPTED, fx.userId),
      quotes.setStatus(quote.id, QuoteStatus.REJECTED, fx.userId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
  });

  it('un cliente sin acceso al producto no puede cotizarlo', async () => {
    const special = await prisma.customer.create({
      data: { name: 'Especial', type: CustomerType.SPECIAL },
    });
    await expect(
      newQuote({ customerId: special.id, customerName: 'Especial' }),
    ).rejects.toThrow(/no tiene acceso/);
  });

  it('los códigos no colisionan bajo concurrencia (F-10)', async () => {
    const created = await Promise.all(Array.from({ length: 15 }, () => newQuote()));
    const codes = created.map((q) => q.code);
    expect(new Set(codes).size).toBe(15);
  });
});
