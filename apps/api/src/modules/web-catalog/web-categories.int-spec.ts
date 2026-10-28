import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { WebCategoriesService } from './web-categories.service';
import { WebProductsService } from './web-products.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F5·6: categorías de la vidriera, aparte de las de precios. Dos niveles; no
 * se borra una categoría con publicaciones o subcategorías.
 */
describe('[int] Categorías de la tienda online', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let products: WebProductsService;
  let service: WebCategoriesService;
  let close: () => Promise<void>;
  let fx: Fixtures;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    products = moduleRef.get(WebProductsService);
    service = moduleRef.get(WebCategoriesService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
  });

  it('crea dos niveles y no deja armar un tercero', async () => {
    const hogar = await service.create({ name: 'Hogar y Deco' }, fx.userId);
    const lamparas = await service.create({ name: 'Lámparas', parentId: hogar.id }, fx.userId);

    expect(hogar.slug).toBe('hogar-y-deco');
    expect(lamparas.parentId).toBe(hogar.id);
    await expect(
      service.create({ name: 'De mesa', parentId: lamparas.id }, fx.userId),
    ).rejects.toThrow(/solo hay dos niveles/);

    // Una categoría con hijas no puede pasar a ser hija.
    const oficina = await service.create({ name: 'Oficina' }, fx.userId);
    await expect(service.update(hogar.id, { parentId: oficina.id }, fx.userId)).rejects.toThrow(
      /tiene subcategorías/,
    );
    await expect(service.update(oficina.id, { parentId: oficina.id }, fx.userId)).rejects.toThrow(
      /dentro de sí misma/,
    );
  });

  it('el slug es único', async () => {
    await service.create({ name: 'Llaveros' }, fx.userId);
    await expect(service.create({ name: 'Llaveros' }, fx.userId)).rejects.toThrow(
      /ya lo usa otra categoría/,
    );
  });

  it('no se puede borrar una categoría con publicaciones o subcategorías', async () => {
    const hogar = await service.create({ name: 'Hogar' }, fx.userId);
    const lamparas = await service.create({ name: 'Lámparas', parentId: hogar.id }, fx.userId);
    const pub = await products.create({ name: 'Lámpara Trapecio' }, fx.userId);
    const asignada = await service.setProductCategories(pub.id, [lamparas.id], fx.userId);
    expect(asignada.categories.map((c) => c.slug)).toEqual(['lamparas']);

    await expect(service.remove(hogar.id, fx.userId)).rejects.toThrow(/tiene 1 subcategoría/);
    await expect(service.remove(lamparas.id, fx.userId)).rejects.toThrow(/tiene 1 publicación/);

    // Sin publicaciones, se borra; y después la madre, que quedó sin hijas.
    await service.setProductCategories(pub.id, [], fx.userId);
    await service.remove(lamparas.id, fx.userId);
    await service.remove(hogar.id, fx.userId);
    expect(await service.list()).toEqual([]);
  });

  it('cambiar las categorías de una publicación no toca las de precios', async () => {
    const deco = await service.create({ name: 'Deco' }, fx.userId);
    const regalos = await service.create({ name: 'Regalos' }, fx.userId);
    const pub = await products.create(
      { name: 'Maceta', members: [{ productId: fx.productId, valueLabel: '' }] },
      fx.userId,
    );

    const result = await service.setProductCategories(
      pub.id,
      [deco.id, regalos.id, deco.id],
      fx.userId,
    );
    expect(result.categories.map((c) => c.name).sort()).toEqual(['Deco', 'Regalos']);
    const producto = await prisma.product.findUniqueOrThrow({ where: { id: fx.productId } });
    expect(producto.categoryId).toBe(fx.categoryId);

    const [listada] = (await service.list()).filter((c) => c.id === deco.id);
    expect(listada!.productCount).toBe(1);

    await expect(service.setProductCategories(pub.id, ['nope'], fx.userId)).rejects.toThrow(
      /Categoría inexistente/,
    );
  });

  it('queda en la auditoría', async () => {
    const cat = await service.create({ name: 'Auditada' }, fx.userId);
    await service.update(cat.id, { description: 'Algo' }, fx.userId);
    await service.remove(cat.id, fx.userId);
    const entradas = await prisma.auditLog.findMany({
      where: { entity: 'WebCategory', entityId: cat.id },
      orderBy: { at: 'asc' },
    });
    expect(entradas.map((e) => e.action)).toEqual(['create', 'update', 'delete']);
  });
});
