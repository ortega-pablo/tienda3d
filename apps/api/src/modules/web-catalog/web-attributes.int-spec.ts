import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { variantMatrix } from './domain/variant-matrix';
import { WebAttributesService } from './web-attributes.service';
import { WebProductsService } from './web-products.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F5·4: opciones informativas sin producto del sistema detrás (D6), como el
 * "Tipo de hoja" de un cuaderno. No cambian el precio.
 */
describe('[int] Opciones informativas de la tienda online', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let products: WebProductsService;
  let service: WebAttributesService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let pubId: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    products = moduleRef.get(WebProductsService);
    service = moduleRef.get(WebAttributesService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    pubId = (
      await products.create(
        { name: 'Cuaderno A5', members: [{ productId: fx.productId, valueLabel: '' }] },
        fx.userId,
      )
    ).id;
  });

  const hoja = (values: Array<{ id?: string; label: string; slug?: string }>, id?: string) => [
    { id, label: 'Tipo de hoja', values },
  ];

  /** Crea una variante que usa el valor, como hará la regeneración (F5·5). */
  const varianteCon = async (valueId: string, sku: string) => {
    const pub = await products.get(pubId);
    await prisma.webVariant.create({
      data: {
        webProductId: pubId,
        memberId: pub.members[0]!.id,
        sku,
        selectionKey: `a=${valueId}`,
        selections: { create: [{ attributeValueId: valueId }] },
      },
    });
  };
  const activa = async (sku: string) =>
    (await prisma.webVariant.findUniqueOrThrow({ where: { sku } })).isActive;

  it('"Tipo de hoja: Cuadro/Punto" da una variante por valor, con el mismo precio', async () => {
    const pub = await service.set(
      pubId,
      hoja([{ label: 'Cuadro' }, { label: 'Punto' }]),
      fx.userId,
    );

    expect(pub.attributes).toHaveLength(1);
    expect(pub.attributes[0]!.values.map((v) => [v.slug, v.label])).toEqual([
      ['cuadro', 'Cuadro'],
      ['punto', 'Punto'],
    ]);

    const combos = variantMatrix({
      members: pub.members.map((m) => ({ id: m.id, productId: m.productId })),
      colorOptions: [],
      attributes: pub.attributes.map((a) => ({ id: a.id, values: a.values.map((v) => v.id) })),
    });
    expect(combos).toHaveLength(2);
    // Mismo miembro → mismo producto del sistema → mismo precio publicado.
    expect(new Set(combos.map((c) => c.memberId)).size).toBe(1);
  });

  it('renombrar un valor por id lo conserva; uno sin id se asocia por slug', async () => {
    const pub = await service.set(
      pubId,
      hoja([{ label: 'Cuadro' }, { label: 'Punto' }]),
      fx.userId,
    );
    const attr = pub.attributes[0]!;
    const [cuadro, punto] = attr.values;

    const otra = await service.set(
      pubId,
      hoja(
        [
          { id: cuadro!.id, label: 'Cuadriculada', slug: 'cuadriculada' },
          { label: 'Punto' },
          { label: 'Rayada' },
        ],
        attr.id,
      ),
      fx.userId,
    );
    const values = otra.attributes[0]!.values;
    expect(otra.attributes[0]!.id).toBe(attr.id);
    expect(values.map((v) => [v.slug, v.id === cuadro!.id || v.id === punto!.id])).toEqual([
      ['cuadriculada', true],
      ['punto', true],
      ['rayada', false],
    ]);
  });

  it('intercambiar los slugs de dos valores no choca con el índice único', async () => {
    const pub = await service.set(pubId, hoja([{ label: 'A' }, { label: 'B' }]), fx.userId);
    const attr = pub.attributes[0]!;
    const [a, b] = attr.values;

    const swap = await service.set(
      pubId,
      hoja(
        [
          { id: a!.id, label: 'B', slug: 'b' },
          { id: b!.id, label: 'A', slug: 'a' },
        ],
        attr.id,
      ),
      fx.userId,
    );
    expect(swap.attributes[0]!.values.map((v) => [v.id, v.slug])).toEqual([
      [a!.id, 'b'],
      [b!.id, 'a'],
    ]);
  });

  it('quitar un valor con variantes lo desactiva con ellas; sin variantes lo borra', async () => {
    const pub = await service.set(
      pubId,
      hoja([{ label: 'Cuadro' }, { label: 'Punto' }, { label: 'Lisa' }]),
      fx.userId,
    );
    const attr = pub.attributes[0]!;
    const [cuadro, punto] = attr.values;
    await varianteCon(punto!.id, 'PTK-TEST-000001-V01');

    const solo = await service.set(pubId, hoja([{ label: 'Cuadro' }], attr.id), fx.userId);

    expect(solo.attributes[0]!.values.map((v) => [v.slug, v.isActive])).toEqual([
      ['cuadro', true],
      ['punto', false],
    ]);
    expect(await activa('PTK-TEST-000001-V01')).toBe(false);
    expect(solo.attributes[0]!.values[0]!.id).toBe(cuadro!.id);

    // Volver a sumarlo por su etiqueta lo reactiva (mismo id).
    const otraVez = await service.set(
      pubId,
      hoja([{ label: 'Cuadro' }, { label: 'Punto' }], attr.id),
      fx.userId,
    );
    expect(otraVez.attributes[0]!.values.map((v) => [v.id, v.isActive])).toEqual([
      [cuadro!.id, true],
      [punto!.id, true],
    ]);
  });

  it('quitar una opción con variantes la desactiva; sin variantes la borra', async () => {
    const pub = await service.set(
      pubId,
      [
        { label: 'Tipo de hoja', values: [{ label: 'Cuadro' }, { label: 'Punto' }] },
        { label: 'Tapa', values: [{ label: 'Dura' }] },
      ],
      fx.userId,
    );
    const [tipo] = pub.attributes;
    await varianteCon(tipo!.values[0]!.id, 'PTK-TEST-000001-V01');

    const ninguna = await service.set(pubId, [], fx.userId);

    expect(ninguna.attributes.map((a) => [a.label, a.isActive])).toEqual([['Tipo de hoja', false]]);
    // Del atributo inactivo queda solo el valor con variantes.
    expect(ninguna.attributes[0]!.values.map((v) => [v.slug, v.isActive])).toEqual([
      ['cuadro', false],
    ]);
    expect(await activa('PTK-TEST-000001-V01')).toBe(false);
  });

  it('rechaza valores repetidos, opciones con el mismo nombre y valores de otra opción', async () => {
    await expect(
      service.set(pubId, hoja([{ label: 'Cuadro' }, { label: 'cuadro' }]), fx.userId),
    ).rejects.toThrow(/repite el valor/);
    await expect(
      service.set(
        pubId,
        [
          { label: 'Tapa', values: [{ label: 'Dura' }] },
          { label: 'tapa', values: [{ label: 'Blanda' }] },
        ],
        fx.userId,
      ),
    ).rejects.toThrow(/dos opciones informativas que se llaman "tapa"/);

    const pub = await service.set(
      pubId,
      [
        { label: 'Tipo de hoja', values: [{ label: 'Cuadro' }] },
        { label: 'Tapa', values: [{ label: 'Dura' }] },
      ],
      fx.userId,
    );
    const [tipo, tapa] = pub.attributes;
    await expect(
      service.set(
        pubId,
        [
          {
            id: tipo!.id,
            label: 'Tipo de hoja',
            values: [{ id: tapa!.values[0]!.id, label: 'X' }],
          },
        ],
        fx.userId,
      ),
    ).rejects.toThrow(/es de otra opción/);
  });

  it('queda en la auditoría', async () => {
    await service.set(pubId, hoja([{ label: 'Cuadro' }]), fx.userId);
    const entradas = await prisma.auditLog.findMany({
      where: { entity: 'WebProduct', entityId: pubId, action: 'set-attributes' },
    });
    expect(entradas).toHaveLength(1);
  });
});
