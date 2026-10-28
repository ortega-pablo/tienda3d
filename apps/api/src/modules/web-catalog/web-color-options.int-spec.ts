import type { TestingModule } from '@nestjs/testing';
import { MaterialType, MaterialUnit } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebProductsService } from './web-products.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F5·3: cada publicación ofrece solo los colores elegidos de la línea de
 * filamento con la que se imprimen sus piezas.
 */
describe('[int] Opciones de color de la tienda online', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let products: WebProductsService;
  let service: WebColorOptionsService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let color: Record<string, string>;
  let petg: string;
  let petgNegro: string;
  let pubId: string;
  let trapecio390: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    products = moduleRef.get(WebProductsService);
    service = moduleRef.get(WebColorOptionsService);
  });

  afterAll(async () => {
    await close();
  });

  const hijo = (parentId: string, nombre: string, isActive = true) =>
    prisma.material.create({
      data: {
        name: nombre,
        color: nombre,
        type: MaterialType.FILAMENT,
        unit: MaterialUnit.KG,
        parentId,
        isActive,
      },
    });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);

    // La línea PLA se puede imprimir en 5 colores; Frutilla está inactivo.
    color = {};
    for (const nombre of ['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde']) {
      color[nombre] = (await hijo(fx.filamentId, nombre)).id;
    }
    color.Frutilla = (await hijo(fx.filamentId, 'Frutilla', false)).id;
    petg = (
      await prisma.material.create({
        data: { name: 'PETG test', type: MaterialType.FILAMENT, unit: MaterialUnit.KG },
      })
    ).id;
    petgNegro = (await hijo(petg, 'PETG Negro')).id;

    trapecio390 = (
      await prisma.product.create({
        data: {
          name: 'Trapecio 390',
          sku: 'PTK-TEST-000390',
          categoryId: fx.categoryId,
          pieces: {
            create: [
              { name: 'Pantalla', grams: 80, printMinutes: 120, defaultFilamentId: fx.filamentId },
              // Dato viejo: la pieza apunta a un color, no a la línea.
              {
                name: 'Base',
                grams: 30,
                printMinutes: 40,
                defaultFilamentId: color.Negro,
                sortOrder: 1,
              },
              {
                name: 'Difusor',
                grams: 10,
                printMinutes: 15,
                defaultFilamentId: petg,
                sortOrder: 2,
              },
            ],
          },
          channels: { create: [{ channelId: fx.channelId, isEnabled: true }] },
        },
      })
    ).id;

    pubId = (
      await products.create(
        {
          name: 'Lámpara Trapecio',
          optionLabel: 'Tamaño',
          members: [
            { productId: fx.productId, valueLabel: '280' },
            { productId: trapecio390, valueLabel: '390' },
          ],
        },
        fx.userId,
      )
    ).id;
  });

  const piezas = async (productId: string) =>
    Object.fromEntries(
      (await prisma.productPiece.findMany({ where: { productId } })).map((p) => [p.name, p.id]),
    );

  it('ofrece 2 de los 5 colores de la línea, en todas las piezas que la usan', async () => {
    const pub = await service.set(
      pubId,
      [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [color.Blanco!, color.Negro!] }],
      fx.userId,
    );

    expect(pub.colorOptions).toHaveLength(1);
    const [opcion] = pub.colorOptions;
    expect(opcion!.filamentLineName).toBe('PLA test');
    expect(opcion!.values.map((v) => v.name)).toEqual(['Blanco', 'Negro']);
    // El Cuerpo del 280 y Pantalla y Base del 390 (la Base, por su color, es PLA); el Difusor es PETG.
    expect(opcion!.pieces.map((p) => `${p.productName}/${p.name}`).sort()).toEqual([
      'Producto test/Cuerpo',
      'Trapecio 390/Base',
      'Trapecio 390/Pantalla',
    ]);
  });

  it('rechaza un color de otra línea', async () => {
    await expect(
      service.set(
        pubId,
        [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [color.Negro!, petgNegro] }],
        fx.userId,
      ),
    ).rejects.toThrow(/"PETG Negro" no es de la línea "PLA test"/);
  });

  it('rechaza un color inactivo', async () => {
    await expect(
      service.set(
        pubId,
        [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [color.Frutilla!] }],
        fx.userId,
      ),
    ).rejects.toThrow(/"Frutilla" está inactivo/);
  });

  it('rechaza una pieza de otro producto', async () => {
    const ajeno = await prisma.product.create({
      data: {
        name: 'Ajeno',
        sku: 'PTK-TEST-000999',
        categoryId: fx.categoryId,
        pieces: {
          create: [{ name: 'Ajena', grams: 5, printMinutes: 5, defaultFilamentId: fx.filamentId }],
        },
      },
    });
    const { Ajena } = await piezas(ajeno.id);

    await expect(
      service.set(
        pubId,
        [
          {
            label: 'Color',
            filamentLineId: fx.filamentId,
            colorIds: [color.Negro!],
            pieceIds: [Ajena!],
          },
        ],
        fx.userId,
      ),
    ).rejects.toThrow(/no es de un producto de esta publicación/);
  });

  it('rechaza una pieza que se imprime con otra línea y una línea que no es un filamento padre', async () => {
    const { Difusor } = await piezas(trapecio390);
    await expect(
      service.set(
        pubId,
        [
          {
            label: 'Color',
            filamentLineId: fx.filamentId,
            colorIds: [color.Negro!],
            pieceIds: [Difusor!],
          },
        ],
        fx.userId,
      ),
    ).rejects.toThrow(/"Difusor" no se imprime con "PLA test"/);

    await expect(
      service.set(
        pubId,
        [{ label: 'Color', filamentLineId: color.Negro!, colorIds: [color.Negro!] }],
        fx.userId,
      ),
    ).rejects.toThrow(/no es una línea de filamento/);
  });

  it('dos opciones de la misma línea necesitan piezas distintas', async () => {
    const { Pantalla, Base } = await piezas(trapecio390);
    const { Cuerpo } = await piezas(fx.productId);

    await expect(
      service.set(
        pubId,
        [
          { label: 'Pantalla', filamentLineId: fx.filamentId, colorIds: [color.Blanco!] },
          { label: 'Base', filamentLineId: fx.filamentId, colorIds: [color.Negro!] },
        ],
        fx.userId,
      ),
    ).rejects.toThrow(/está en "Pantalla" y en "Base"/);

    const pub = await service.set(
      pubId,
      [
        {
          label: 'Pantalla',
          filamentLineId: fx.filamentId,
          colorIds: [color.Blanco!, color.Rojo!],
          pieceIds: [Pantalla!, Cuerpo!],
        },
        {
          label: 'Base',
          filamentLineId: fx.filamentId,
          colorIds: [color.Negro!],
          pieceIds: [Base!],
        },
      ],
      fx.userId,
    );
    expect(pub.colorOptions.map((o) => [o.label, o.pieces.length])).toEqual([
      ['Pantalla', 2],
      ['Base', 1],
    ]);
  });

  it('quitar un color deja sin venta sus variantes; quitar una opción con variantes la desactiva', async () => {
    const pub = await service.set(
      pubId,
      [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [color.Negro!, color.Blanco!] }],
      fx.userId,
    );
    const opcion = pub.colorOptions[0]!;
    const m280 = pub.members.find((m) => m.valueLabel === '280')!;
    for (const [n, nombre] of (['Negro', 'Blanco'] as const).entries()) {
      await prisma.webVariant.create({
        data: {
          webProductId: pubId,
          memberId: m280.id,
          sku: `PTK-TEST-000001-V0${n + 1}`,
          selectionKey: `color=${nombre}`,
          selections: { create: [{ colorOptionId: opcion.id, materialId: color[nombre]! }] },
        },
      });
    }
    const activa = async (sku: string) =>
      (await prisma.webVariant.findUniqueOrThrow({ where: { sku } })).isActive;

    // Se va el Blanco: su variante deja de venderse; la del Negro sigue.
    const sinBlanco = await service.set(
      pubId,
      [
        {
          id: opcion.id,
          label: 'Color',
          filamentLineId: fx.filamentId,
          colorIds: [color.Negro!],
        },
      ],
      fx.userId,
    );
    expect(sinBlanco.colorOptions[0]!.id).toBe(opcion.id);
    expect(await activa('PTK-TEST-000001-V01')).toBe(true);
    expect(await activa('PTK-TEST-000001-V02')).toBe(false);

    // Sin la opción: tiene variantes, así que queda inactiva con ellas.
    const sinOpciones = await service.set(pubId, [], fx.userId);
    expect(sinOpciones.colorOptions.map((o) => o.isActive)).toEqual([false]);
    expect(await activa('PTK-TEST-000001-V01')).toBe(false);

    // Una opción sin variantes se borra.
    const otra = await service.set(
      pubId,
      [{ label: 'Otra', filamentLineId: fx.filamentId, colorIds: [color.Azul!] }],
      fx.userId,
    );
    expect(otra.colorOptions.map((o) => [o.label, o.isActive])).toEqual([
      ['Otra', true],
      ['Color', false],
    ]);
    const vacia = await service.set(pubId, [], fx.userId);
    expect(vacia.colorOptions.map((o) => o.label)).toEqual(['Color']);
  });

  it('un color que se desactiva en Insumos queda marcado para el panel', async () => {
    await service.set(
      pubId,
      [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [color.Negro!, color.Rojo!] }],
      fx.userId,
    );
    await prisma.material.update({ where: { id: color.Rojo! }, data: { isActive: false } });

    const pub = await products.get(pubId);
    expect(pub.colorOptions[0]!.values.map((v) => [v.name, v.isActive])).toEqual([
      ['Negro', true],
      ['Rojo', false],
    ]);
  });

  it('un miembro que sale de la publicación saca sus piezas de las opciones', async () => {
    await service.set(
      pubId,
      [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [color.Negro!] }],
      fx.userId,
    );

    const pub = await products.setMembers(
      pubId,
      [{ productId: trapecio390, valueLabel: '390' }],
      fx.userId,
    );
    expect(pub.colorOptions[0]!.pieces.map((p) => p.name).sort()).toEqual(['Base', 'Pantalla']);
  });

  it('queda en la auditoría', async () => {
    await service.set(
      pubId,
      [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [color.Negro!] }],
      fx.userId,
    );
    const entradas = await prisma.auditLog.findMany({
      where: { entity: 'WebProduct', entityId: pubId, action: 'set-color-options' },
    });
    expect(entradas).toHaveLength(1);
  });
});
