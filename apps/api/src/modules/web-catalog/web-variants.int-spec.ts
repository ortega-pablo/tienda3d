import type { TestingModule } from '@nestjs/testing';
import { MaterialType, MaterialUnit } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { WebAttributesService } from './web-attributes.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebProductsService } from './web-products.service';
import { WebVariantsService } from './web-variants.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F5·5: cada combinación vendible tiene su SKU (inmutable), su disponibilidad
 * y su stock. Regenerar conserva, crea y desactiva; nunca borra.
 */
describe('[int] Variantes de la tienda online', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let products: WebProductsService;
  let colorOptions: WebColorOptionsService;
  let attributes: WebAttributesService;
  let service: WebVariantsService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let color: Record<string, string>;
  let pubId: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    products = moduleRef.get(WebProductsService);
    colorOptions = moduleRef.get(WebColorOptionsService);
    attributes = moduleRef.get(WebAttributesService);
    service = moduleRef.get(WebVariantsService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);

    color = {};
    for (const nombre of ['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde']) {
      color[nombre] = (
        await prisma.material.create({
          data: {
            name: `PLA ${nombre}`,
            color: nombre,
            type: MaterialType.FILAMENT,
            unit: MaterialUnit.KG,
            parentId: fx.filamentId,
          },
        })
      ).id;
    }
    const trapecio390 = await prisma.product.create({
      data: {
        name: 'Trapecio 390',
        sku: 'PTK-TEST-000390',
        categoryId: fx.categoryId,
        pieces: {
          create: [
            { name: 'Pantalla', grams: 80, printMinutes: 120, defaultFilamentId: fx.filamentId },
          ],
        },
        channels: { create: [{ channelId: fx.channelId, isEnabled: true }] },
      },
    });
    pubId = (
      await products.create(
        {
          name: 'Lámpara Trapecio',
          optionLabel: 'Tamaño',
          members: [
            { productId: fx.productId, valueLabel: '280' },
            { productId: trapecio390.id, valueLabel: '390' },
          ],
        },
        fx.userId,
      )
    ).id;
  });

  const conColores = async (nombres: string[]) => {
    const actual = (await products.get(pubId)).colorOptions.find((o) => o.isActive);
    return colorOptions.set(
      pubId,
      [
        {
          id: actual?.id,
          label: 'Color',
          filamentLineId: fx.filamentId,
          colorIds: nombres.map((n) => color[n]!),
        },
      ],
      fx.userId,
    );
  };
  const skuPorCombinacion = (pub: Awaited<ReturnType<typeof products.get>>) =>
    Object.fromEntries(
      pub.variants.map((v) => [`${v.memberLabel}/${v.options.map((o) => o.label).join('/')}`, v]),
    );

  it('la Trapecio (2 tamaños × 4 colores) da 8 variantes con SKU por miembro', async () => {
    await conColores(['Negro', 'Blanco', 'Rojo', 'Azul']);

    const result = await service.regenerate(pubId, fx.userId);

    expect(result.created).toBe(8);
    expect(result.product.variants).toHaveLength(8);
    expect(result.product.variants.map((v) => v.sku).sort()).toEqual([
      'PTK-TEST-000001-V01',
      'PTK-TEST-000001-V02',
      'PTK-TEST-000001-V03',
      'PTK-TEST-000001-V04',
      'PTK-TEST-000390-V01',
      'PTK-TEST-000390-V02',
      'PTK-TEST-000390-V03',
      'PTK-TEST-000390-V04',
    ]);
    const v = skuPorCombinacion(result.product)['390/Rojo']!;
    expect(v.availability).toBe('MADE_TO_ORDER');
    expect(v.sale).toEqual({ state: 'MADE_TO_ORDER', maxQuantity: 20 });
  });

  it('quitar un color desactiva 2 y conservarlo no cambia los SKU', async () => {
    await conColores(['Negro', 'Blanco', 'Rojo', 'Azul']);
    const antes = skuPorCombinacion((await service.regenerate(pubId, fx.userId)).product);

    await conColores(['Negro', 'Blanco', 'Rojo']);
    const sinAzul = await service.regenerate(pubId, fx.userId);
    const despues = skuPorCombinacion(sinAzul.product);

    expect(sinAzul.created).toBe(0);
    expect(sinAzul.product.variants.filter((v) => v.isActive)).toHaveLength(6);
    expect(despues['280/Azul']!.isActive).toBe(false);
    expect(despues['390/Azul']!.isActive).toBe(false);
    for (const combinacion of ['280/Negro', '280/Blanco', '280/Rojo', '390/Negro', '390/Rojo']) {
      expect(despues[combinacion]!.sku).toBe(antes[combinacion]!.sku);
      expect(despues[combinacion]!.isActive).toBe(true);
    }

    // Volver a sumarlo reactiva las mismas variantes, con sus SKU.
    await conColores(['Negro', 'Blanco', 'Rojo', 'Azul']);
    const conAzul = await service.regenerate(pubId, fx.userId);
    expect(conAzul.reactivated).toBe(2);
    expect(conAzul.created).toBe(0);
    expect(skuPorCombinacion(conAzul.product)['390/Azul']!.sku).toBe(antes['390/Azul']!.sku);

    // Un color nuevo sigue el contador de cada miembro.
    await conColores(['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde']);
    const conVerde = skuPorCombinacion((await service.regenerate(pubId, fx.userId)).product);
    expect(conVerde['280/Verde']!.sku).toBe('PTK-TEST-000001-V05');
    expect(conVerde['390/Verde']!.sku).toBe('PTK-TEST-000390-V05');
  });

  it('las opciones informativas multiplican las variantes, con el mismo miembro', async () => {
    await conColores(['Negro']);
    await attributes.set(
      pubId,
      [{ label: 'Encastre', values: [{ label: 'E27' }, { label: 'E14' }] }],
      fx.userId,
    );

    const result = await service.regenerate(pubId, fx.userId);
    expect(result.created).toBe(4);
    expect(Object.keys(skuPorCombinacion(result.product)).sort()).toEqual([
      '280/Negro/E14',
      '280/Negro/E27',
      '390/Negro/E14',
      '390/Negro/E27',
    ]);
  });

  it('una variante pausada a mano no vuelve con la regeneración', async () => {
    await conColores(['Negro', 'Blanco']);
    const pub = (await service.regenerate(pubId, fx.userId)).product;
    const negro280 = skuPorCombinacion(pub)['280/Negro']!;

    const pausada = await service.update(negro280.id, { isActive: false }, fx.userId);
    expect(skuPorCombinacion(pausada)['280/Negro']).toMatchObject({
      isActive: false,
      pausedByAdmin: true,
    });

    const otra = await service.regenerate(pubId, fx.userId);
    expect(otra.paused).toBe(1);
    expect(skuPorCombinacion(otra.product)['280/Negro']!.isActive).toBe(false);

    // Prenderla a mano la devuelve a la venta.
    const prendida = await service.update(negro280.id, { isActive: true }, fx.userId);
    expect(skuPorCombinacion(prendida)['280/Negro']).toMatchObject({
      isActive: true,
      pausedByAdmin: false,
    });
  });

  it('no deja prender una variante cuyo color ya no se ofrece', async () => {
    await conColores(['Negro', 'Blanco']);
    const pub = (await service.regenerate(pubId, fx.userId)).product;
    await conColores(['Negro']);

    await expect(
      service.update(skuPorCombinacion(pub)['280/Blanco']!.id, { isActive: true }, fx.userId),
    ).rejects.toThrow(/ya no es una combinación de la publicación/);
  });

  it('un color desactivado en Insumos sale de la matriz al regenerar', async () => {
    await conColores(['Negro', 'Blanco']);
    await service.regenerate(pubId, fx.userId);
    await prisma.material.update({ where: { id: color.Blanco! }, data: { isActive: false } });

    const result = await service.regenerate(pubId, fx.userId);
    expect(result.deactivated).toBe(2);
    expect(result.product.variants.filter((v) => v.isActive)).toHaveLength(2);
  });

  it('edita disponibilidad, stock, máximo y plazo (D9)', async () => {
    await conColores(['Negro']);
    const pub = (await service.regenerate(pubId, fx.userId)).product;
    const variante = skuPorCombinacion(pub)['390/Negro']!;

    const editada = await service.update(
      variante.id,
      { availability: 'STOCK_ONLY', stockQuantity: 3, maxPerOrder: 2, leadTimeDays: 7 },
      fx.userId,
    );
    expect(skuPorCombinacion(editada)['390/Negro']).toMatchObject({
      availability: 'STOCK_ONLY',
      stockQuantity: 3,
      maxPerOrder: 2,
      leadTimeDays: 7,
      sale: { state: 'IN_STOCK', maxQuantity: 2 },
    });

    const otra = await products.create({ name: 'Otra' }, fx.userId);
    const foto = await prisma.webImage.create({
      data: { webProductId: otra.id, path: 'catalog/x.webp', width: 10, height: 10 },
    });
    await expect(service.update(variante.id, { imageId: foto.id }, fx.userId)).rejects.toThrow(
      /no es de esta publicación/,
    );
  });

  it('nunca borra variantes: un miembro que sale las deja inactivas', async () => {
    await conColores(['Negro', 'Blanco']);
    await service.regenerate(pubId, fx.userId);
    const pub = await products.get(pubId);
    await products.setMembers(
      pubId,
      pub.members
        .filter((m) => m.valueLabel === '390')
        .map((m) => ({ productId: m.productId, valueLabel: m.valueLabel })),
      fx.userId,
    );

    const result = await service.regenerate(pubId, fx.userId);
    expect(await prisma.webVariant.count({ where: { webProductId: pubId } })).toBe(4);
    expect(result.product.variants.filter((v) => v.isActive).map((v) => v.memberLabel)).toEqual([
      '390',
      '390',
    ]);
  });
});
