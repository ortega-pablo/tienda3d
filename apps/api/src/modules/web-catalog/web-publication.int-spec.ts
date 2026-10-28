import type { TestingModule } from '@nestjs/testing';
import { MaterialType, MaterialUnit, WebPriceState } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CatalogEvents } from './catalog-events';
import { WebColorOptionsService } from './web-color-options.service';
import { WebProductsService } from './web-products.service';
import { WebPublicationService } from './web-publication.service';
import { WebVariantsService } from './web-variants.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F5·7: el botón de publicar u ocultar, con la lista de lo que falta antes de
 * publicar y un aviso `catalog.changed` por cada cambio.
 */
describe('[int] Publicar y ocultar en la tienda online', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let products: WebProductsService;
  let service: WebPublicationService;
  let events: CatalogEvents;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let pubId: string;
  let negro: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    products = moduleRef.get(WebProductsService);
    service = moduleRef.get(WebPublicationService);
    events = moduleRef.get(CatalogEvents);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    negro = (
      await prisma.material.create({
        data: {
          name: 'PLA Negro',
          color: 'Negro',
          type: MaterialType.FILAMENT,
          unit: MaterialUnit.KG,
          parentId: fx.filamentId,
        },
      })
    ).id;
    pubId = (
      await products.create(
        { name: 'Maceta Geo', members: [{ productId: fx.productId, valueLabel: '' }] },
        fx.userId,
      )
    ).id;
  });

  /** Deja la publicación lista para vender: descripción, foto, variante y precio. */
  const completar = async () => {
    await products.update(pubId, { description: 'Maceta facetada.' }, fx.userId);
    await prisma.webImage.create({
      data: { webProductId: pubId, path: 'catalog/maceta.webp', width: 800, height: 800 },
    });
    await moduleRef
      .get(WebColorOptionsService)
      .set(
        pubId,
        [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [negro] }],
        fx.userId,
      );
    await moduleRef.get(WebVariantsService).regenerate(pubId, fx.userId);
    await precio(WebPriceState.OK);
  };
  const precio = (state: WebPriceState) =>
    prisma.webPrice.upsert({
      where: { productId: fx.productId },
      create: {
        productId: fx.productId,
        price: state === WebPriceState.OK ? 12500 : null,
        state,
        inputsHash: 'test',
        computedAt: new Date(),
      },
      update: { state, price: state === WebPriceState.OK ? 12500 : null },
    });

  it('una publicación vacía no se publica y responde qué falta', async () => {
    const checklist = await service.checklist(pubId);
    expect(checklist.ready).toBe(false);
    expect(checklist.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual([
      'description',
      'image',
      'variant',
    ]);

    const error = await service.publish(pubId, fx.userId).catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 422,
      response: {
        missing: [
          'Tiene descripción',
          'Tiene al menos una foto',
          'Tiene al menos una variante activa con precio',
        ],
      },
    });
    expect((await products.get(pubId)).status).toBe('DRAFT');
  });

  it('una variante sin precio o con un color inactivo no cuenta', async () => {
    await completar();
    await precio(WebPriceState.NO_PRICE);
    expect((await service.checklist(pubId)).ready).toBe(false);

    await precio(WebPriceState.OK);
    expect((await service.checklist(pubId)).ready).toBe(true);

    await prisma.material.update({ where: { id: negro }, data: { isActive: false } });
    const checklist = await service.checklist(pubId);
    expect(checklist.checks.find((c) => c.key === 'variant')!.ok).toBe(false);
  });

  it('ida y vuelta publicar → ocultar → publicar, con aviso y auditoría', async () => {
    await completar();
    const changed = jest.spyOn(events, 'changed');

    const publicada = await service.publish(pubId, fx.userId);
    expect(publicada.status).toBe('PUBLISHED');
    expect(publicada.publishedAt).not.toBeNull();

    const oculta = await service.hide(pubId, fx.userId);
    expect(oculta.status).toBe('HIDDEN');

    const otraVez = await service.publish(pubId, fx.userId);
    expect(otraVez.status).toBe('PUBLISHED');
    // La fecha de alta es la de la primera publicación.
    expect(otraVez.publishedAt).toBe(publicada.publishedAt);

    expect(changed).toHaveBeenCalledTimes(3);
    expect(changed.mock.calls.map(([, event]) => event)).toEqual([
      { scope: 'product', ids: ['maceta-geo'] },
      { scope: 'product', ids: ['maceta-geo'] },
      { scope: 'product', ids: ['maceta-geo'] },
    ]);
    const entradas = await prisma.auditLog.findMany({
      where: { entity: 'WebProduct', entityId: pubId, action: { in: ['publish', 'hide'] } },
      orderBy: { at: 'asc' },
    });
    expect(entradas.map((e) => e.action)).toEqual(['publish', 'hide', 'publish']);
  });

  it('publicar lo publicado u ocultar lo oculto no cambia nada ni avisa', async () => {
    await completar();
    await service.publish(pubId, fx.userId);
    const changed = jest.spyOn(events, 'changed');

    await service.publish(pubId, fx.userId);
    await service.hide(pubId, fx.userId);
    await service.hide(pubId, fx.userId);

    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('un borrador no se puede ocultar', async () => {
    await expect(service.hide(pubId, fx.userId)).rejects.toThrow(/nunca se publicó/);
  });
});
