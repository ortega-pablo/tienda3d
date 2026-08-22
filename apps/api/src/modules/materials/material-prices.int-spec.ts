import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MaterialPricesService } from './material-prices.service';
import { CostingService } from '../costing/costing.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F-11: nada garantizaba un solo precio vigente por insumo. El índice único
 * parcial vive en SQL puro (Prisma no expresa índices parciales), así que sólo
 * un test contra Postgres real puede comprobar que existe y que funciona.
 */
describe('[int] Un solo precio vigente por insumo', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let prices: MaterialPricesService;
  let costing: CostingService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let supplierId: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    prices = moduleRef.get(MaterialPricesService);
    costing = moduleRef.get(CostingService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    supplierId = (await prisma.supplier.findFirstOrThrow()).id;
  });

  it('la base RECHAZA un segundo precio vigente para el mismo insumo', async () => {
    await expect(
      prisma.supplierMaterial.create({
        data: { materialId: fx.filamentId, supplierId, price: 999, isCurrent: true },
      }),
    ).rejects.toThrow(/Unique constraint|unique/i);
  });

  it('marcar otro precio como vigente apaga el anterior sin violar el índice', async () => {
    const nuevo = await prices.create(fx.filamentId, {
      supplierId,
      price: 30_000,
      setCurrent: true,
    });

    const vigentes = await prisma.supplierMaterial.findMany({
      where: { materialId: fx.filamentId, isCurrent: true },
    });
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]!.id).toBe(nuevo.id);
  });

  it('el costeo usa el precio vigente, y cambiarlo cambia el costo', async () => {
    const antes = await costing.forProduct(fx.productId);

    await prices.create(fx.filamentId, { supplierId, price: 40_000, setCurrent: true });
    const despues = await costing.forProduct(fx.productId);

    // El filamento pasó de 20.000 a 40.000 por kg: el costo tiene que subir.
    expect(despues.filament.raw).toBeCloseTo(antes.filament.raw * 2, 4);
    expect(despues.totalCost).toBeGreaterThan(antes.totalCost);
  });
});
