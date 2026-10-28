import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MaterialType, MaterialUnit } from '@prisma/client';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { CatalogEvents } from './catalog-events';
import {
  RECALC_DEBOUNCE_MS,
  RECALC_TIMER,
  WebPriceRecalcService,
  type RecalcTimer,
} from './web-price-recalc.service';
import { WebProductsService } from './web-products.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

interface FakeHandle {
  fn: () => void;
  ms: number;
  cancelled: boolean;
}

/**
 * F7·2: cambiar un costo o un markup actualiza solo el precio web. El reloj
 * del debounce está controlado: se ve qué quedó programado y a cuánto.
 */
describe('[int] Recálculo automático de los precios web', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let recalc: WebPriceRecalcService;
  let events: CatalogEvents;
  let token: string;
  let fx: Fixtures;
  let timers: FakeHandle[];
  let p2: string;
  let p3: string;
  let supplierId: string;

  const fakeTimer: RecalcTimer = {
    setTimeout: (fn, ms) => {
      const handle = { fn, ms, cancelled: false };
      timers.push(handle);
      return handle;
    },
    clearTimeout: (handle) => {
      (handle as FakeHandle).cancelled = true;
    },
  };
  const programados = () => timers.filter((t) => !t.cancelled);
  /** Avanza el reloj: corre lo programado y espera a que termine el recálculo. */
  const avanzar = async () => {
    for (const t of programados()) {
      t.cancelled = true;
      t.fn();
    }
    await recalc.idle();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RECALC_TIMER)
      .useValue(fakeTimer)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    recalc = app.get(WebPriceRecalcService);
    events = app.get(CatalogEvents);
  });

  afterAll(async () => {
    await app.close();
  });

  const producto = (sku: string, filamentId: string) =>
    prisma.product.create({
      data: {
        name: sku,
        sku,
        categoryId: fx.categoryId,
        pieces: {
          create: [{ name: 'Cuerpo', grams: 60, printMinutes: 90, defaultFilamentId: filamentId }],
        },
        channels: { create: [{ channelId: fx.channelId, isEnabled: true }] },
      },
    });
  const precio = async (productId: string) =>
    Number((await prisma.webPrice.findUniqueOrThrow({ where: { productId } })).price);

  beforeEach(async () => {
    jest.restoreAllMocks();
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    timers = [];
    await prisma.material.update({ where: { id: fx.filamentId }, data: { name: 'PLA Genérico' } });
    supplierId = (await prisma.supplier.findFirstOrThrow()).id;

    const petg = await prisma.material.create({
      data: { name: 'PETG', type: MaterialType.FILAMENT, unit: MaterialUnit.KG, wastePct: 5 },
    });
    await prisma.supplierMaterial.create({
      data: { materialId: petg.id, supplierId, price: 25_000, isCurrent: true },
    });
    p2 = (await producto('PTK-TEST-000002', fx.filamentId)).id;
    p3 = (await producto('PTK-TEST-000003', petg.id)).id;

    // Dos publicaciones: entrar a la tienda ya les calcula el precio.
    const products = app.get(WebProductsService);
    await products.create(
      { name: 'Maceta', members: [{ productId: fx.productId, valueLabel: '' }] },
      fx.userId,
    );
    await products.create(
      {
        name: 'Lámpara',
        members: [
          { productId: p2, valueLabel: 'PLA' },
          { productId: p3, valueLabel: 'PETG' },
        ],
      },
      fx.userId,
    );
    token = app.get(JwtService).sign({
      sub: fx.userId,
      email: 'test@plastik.local',
      role: 'admin',
      permissions: ['material:read', 'material:write', 'ecommerce:read', 'ecommerce:write'],
    });
  });

  const nuevoPrecioPLA = (price: number) =>
    request(app.getHttpServer())
      .post(`/materials/${fx.filamentId}/prices`)
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, price, setCurrent: true });

  it('cambiar el precio vigente de PLA Genérico actualiza en menos de 5 s los productos que lo usan', async () => {
    const antes = { p1: await precio(fx.productId), p2: await precio(p2), p3: await precio(p3) };
    const changed = jest.spyOn(events, 'changed');

    await nuevoPrecioPLA(40_000).expect(201);

    // Quedó un recálculo programado, dentro del plazo.
    expect(programados()).toHaveLength(1);
    expect(programados()[0]!.ms).toBe(RECALC_DEBOUNCE_MS);
    expect(RECALC_DEBOUNCE_MS).toBeLessThan(5_000);
    // Antes de que pase la espera, nada cambió.
    expect(await precio(fx.productId)).toBe(antes.p1);

    await avanzar();

    expect(await precio(fx.productId)).toBeGreaterThan(antes.p1);
    expect(await precio(p2)).toBeGreaterThan(antes.p2);
    expect(await precio(p3)).toBe(antes.p3);
    const historial = await prisma.webPriceHistory.findMany({
      where: { productId: fx.productId },
      orderBy: { changedAt: 'asc' },
    });
    expect(historial.map((h) => h.cause)).toEqual(['Alta en la tienda', 'Precio de insumo']);
    // Lo disparó un cambio del sistema: se revalida todo el catálogo.
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0]![1]).toEqual({ scope: 'catalog', ids: [] });
  });

  it('una ráfaga de cambios corre un solo recálculo', async () => {
    await nuevoPrecioPLA(30_000).expect(201);
    await nuevoPrecioPLA(35_000).expect(201);
    await nuevoPrecioPLA(40_000).expect(201);

    expect(timers).toHaveLength(3);
    expect(programados()).toHaveLength(1);
    const run = jest.spyOn(recalc, 'recomputeAll');
    await avanzar();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('una escritura que falla no programa nada', async () => {
    await request(app.getHttpServer())
      .post(`/materials/${fx.filamentId}/prices`)
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, setCurrent: true })
      .expect(400);
    expect(programados()).toHaveLength(0);
  });

  it('el botón "Recalcular precios" revisa todos los productos de la tienda', async () => {
    const res = await request(app.getHttpServer())
      .post('/web-catalog/prices/recompute')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ checked: 3, changed: 0 });
  });
});
