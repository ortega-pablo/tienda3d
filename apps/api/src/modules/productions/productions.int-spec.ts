import { ConflictException } from '@nestjs/common';
import { ProductionStatus, StockMovementType } from '@prisma/client';
import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CostingService } from '../costing/costing.service';
import { ProductionsService } from './productions.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * Flujo de producción contra Postgres real. Cubre el contrato de F-02: el
 * descuento de stock y el cambio de estado son atómicos, y dos requests
 * concurrentes a DONE no pueden descontar dos veces.
 */
describe('[int] Flujo de producción', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: ProductionsService;
  let close: () => Promise<void>;
  let fx: Fixtures;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    service = moduleRef.get(ProductionsService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
  });

  const stockOf = async (materialId: string) =>
    Number((await prisma.material.findUniqueOrThrow({ where: { id: materialId } })).currentStock);

  it('pasar a DONE descuenta el stock exactamente una vez', async () => {
    const before = await stockOf(fx.materialId);
    const order = await service.create({ productId: fx.productId, quantity: 3 }, fx.userId);

    await service.setStatus(order.id, ProductionStatus.DONE, fx.userId);

    // 2 unidades por producto × 3 productos, sin merma.
    expect(await stockOf(fx.materialId)).toBeCloseTo(before - 6, 5);

    const movements = await prisma.stockMovement.findMany({
      where: { productionId: order.id, materialId: fx.materialId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.type).toBe(StockMovementType.OUT);
  });

  it('dos DONE concurrentes: uno gana, el otro da 409 y el stock baja una sola vez', async () => {
    const before = await stockOf(fx.materialId);
    const order = await service.create({ productId: fx.productId, quantity: 3 }, fx.userId);

    const results = await Promise.allSettled([
      service.setStatus(order.id, ProductionStatus.DONE, fx.userId),
      service.setStatus(order.id, ProductionStatus.DONE, fx.userId),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    // Lo que importa: el stock bajó UNA vez, no dos.
    expect(await stockOf(fx.materialId)).toBeCloseTo(before - 6, 5);
    // Dos líneas por consumo: el filamento de la pieza y el insumo de la receta.
    // Lo relevante es que sean las de UNA sola ejecución, no las de dos.
    expect(await prisma.stockMovement.count({ where: { productionId: order.id } })).toBe(2);
  });

  it('si el consumo falla, revierte también el cambio de estado', async () => {
    const before = await stockOf(fx.materialId);
    const order = await service.create({ productId: fx.productId, quantity: 1 }, fx.userId);

    // Un actor inexistente hace fallar el INSERT de stock_movements por FK,
    // ya dentro de la transacción y DESPUÉS del update de estado. Es el
    // escenario exacto de F-02: antes, el descuento vivía en su propia
    // transacción y podía quedar confirmado con la orden sin pasar a DONE.
    await expect(
      service.setStatus(order.id, ProductionStatus.DONE, 'usuario-inexistente'),
    ).rejects.toBeDefined();

    const after = await prisma.productionOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe(ProductionStatus.PLANNED);
    expect(after.finishedAt).toBeNull();
    expect(await stockOf(fx.materialId)).toBeCloseTo(before, 5);
    expect(await prisma.stockMovement.count({ where: { productionId: order.id } })).toBe(0);
  });

  it('los códigos de OP no colisionan bajo concurrencia (F-10)', async () => {
    const orders = await Promise.all(
      Array.from({ length: 15 }, () =>
        service.create({ productId: fx.productId, quantity: 1 }, fx.userId),
      ),
    );
    const codes = orders.map((o) => o.code);
    expect(new Set(codes).size).toBe(15);
    expect(codes.every((c) => /^OP-\d{4}-\d{4}$/.test(c))).toBe(true);
  });
});

/**
 * F2·5: una orden de llaveros fabrica solo las piezas de su escala, igual que
 * la cotización. Antes se sumaban las piezas INDIVIDUAL y las de tanda.
 */
describe('[int] Producción de llaveros', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: ProductionsService;
  let costing: CostingService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let llaveroId: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    service = moduleRef.get(ProductionsService);
    costing = moduleRef.get(CostingService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    await prisma.keychainScaleTier.createMany({
      data: [
        { minQty: 1, maxQty: 4, markupPct: 150, sortOrder: 1 },
        { minQty: 5, maxQty: 24, markupPct: 120, sortOrder: 2 },
        { minQty: 25, maxQty: 49, markupPct: 100, sortOrder: 3 },
        { minQty: 50, maxQty: 99, markupPct: 90, sortOrder: 4 },
        { minQty: 100, maxQty: null, markupPct: 80, sortOrder: 5 },
      ],
    });
    const llavero = await prisma.product.create({
      data: {
        name: 'Llavero test',
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
      },
    });
    llaveroId = llavero.id;
  });

  const gramosDeFilamento = async (quantity: number) => {
    const lines = await service.previewConsumption(llaveroId, quantity);
    const filament = lines.find((l) => l.materialId === fx.filamentId)!;
    return Math.round(filament.recipeQty * 1000 * 1000) / 1000;
  };

  it('de 1 a 4 unidades consume solo la pieza individual', async () => {
    expect(await gramosDeFilamento(1)).toBe(10);
    expect(await gramosDeFilamento(4)).toBe(40);
  });

  it('desde 5 unidades consume la tanda repartida por unidad', async () => {
    // 40 g la tanda ÷ 5 llaveros = 8 g por llavero.
    expect(await gramosDeFilamento(10)).toBe(80);
  });

  it('el costo guardado en la orden es el de la escala, como en la cotización', async () => {
    const uno = await service.create({ productId: llaveroId, quantity: 1 }, fx.userId);
    const diez = await service.create({ productId: llaveroId, quantity: 10 }, fx.userId);

    const individual = await costing.forProduct(llaveroId, { pieceScope: 'INDIVIDUAL' });
    const tanda = await costing.forProduct(llaveroId, { pieceScope: 'BATCH', divideBy: 5 });
    expect(uno.totalCostSnapshot).toBeCloseTo(individual.costWithProvisions * 1, 2);
    expect(diez.totalCostSnapshot).toBeCloseTo(tanda.costWithProvisions * 10, 2);
  });
});
