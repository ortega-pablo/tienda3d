import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { WebProductsService } from './web-products.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F5·2: publicaciones de la tienda online y sus miembros (productos del
 * sistema que son tamaños o modelos de lo mismo).
 */
describe('[int] Publicaciones de la tienda online', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: WebProductsService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let trapecio390: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    service = moduleRef.get(WebProductsService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    trapecio390 = (await nuevoProducto('PTK-TEST-000390', 'Trapecio 390')).id;
  });

  const nuevoProducto = (sku: string, name: string, conDirecta = true) =>
    prisma.product.create({
      data: {
        name,
        sku,
        categoryId: fx.categoryId,
        pieces: {
          create: [
            { name: 'Cuerpo', grams: 80, printMinutes: 120, defaultFilamentId: fx.filamentId },
          ],
        },
        channels: { create: [{ channelId: fx.channelId, isEnabled: conDirecta }] },
      },
    });

  it('crea una publicación con dos productos del sistema como tamaños', async () => {
    const pub = await service.create(
      {
        name: 'Lámpara Trapecio — Mesa',
        optionLabel: 'Tamaño',
        members: [
          { productId: fx.productId, valueLabel: '280' },
          { productId: trapecio390, valueLabel: '390' },
        ],
      },
      fx.userId,
    );

    expect(pub.slug).toBe('lampara-trapecio-mesa');
    expect(pub.status).toBe('DRAFT');
    expect(pub.members.map((m) => m.valueLabel)).toEqual(['280', '390']);
  });

  it('rechaza productos archivados o sin Venta Directa', async () => {
    const archivado = await nuevoProducto('PTK-TEST-000901', 'Archivado');
    await prisma.product.update({ where: { id: archivado.id }, data: { isActive: false } });
    const sinDirecta = await nuevoProducto('PTK-TEST-000902', 'Sin directa', false);

    await expect(
      service.create(
        { name: 'A', members: [{ productId: archivado.id, valueLabel: '' }] },
        fx.userId,
      ),
    ).rejects.toThrow(/archivado/);
    await expect(
      service.create(
        { name: 'B', members: [{ productId: sinDirecta.id, valueLabel: '' }] },
        fx.userId,
      ),
    ).rejects.toThrow(/Venta Directa/);
  });

  it('un producto del sistema va en una sola publicación', async () => {
    await service.create(
      { name: 'Primera', members: [{ productId: fx.productId, valueLabel: '' }] },
      fx.userId,
    );

    await expect(
      service.create(
        { name: 'Segunda', members: [{ productId: fx.productId, valueLabel: '' }] },
        fx.userId,
      ),
    ).rejects.toThrow(/ya está en la publicación "Primera"/);
    // La transacción no deja la segunda publicación a medias.
    expect(await prisma.webProduct.count({ where: { name: 'Segunda' } })).toBe(0);
  });

  it('cambiar el slug guarda el viejo, que ninguna otra publicación puede tomar', async () => {
    const pub = await service.create({ name: 'Lámpara Lina' }, fx.userId);

    const cambiada = await service.update(pub.id, { slug: 'lampara-lina-mesa' }, fx.userId);
    expect(cambiada.slug).toBe('lampara-lina-mesa');
    expect(cambiada.previousSlugs).toEqual(['lampara-lina']);

    await expect(service.create({ name: 'Otra', slug: 'lampara-lina' }, fx.userId)).rejects.toThrow(
      /ya lo usa otra publicación/,
    );

    // Volver al slug anterior lo saca de los viejos.
    const vuelta = await service.update(pub.id, { slug: 'lampara-lina' }, fx.userId);
    expect(vuelta.previousSlugs).toEqual(['lampara-lina-mesa']);
  });

  it('quitar un miembro con variantes lo desactiva; sin variantes lo borra', async () => {
    const pub = await service.create(
      {
        name: 'Trapecio',
        members: [
          { productId: fx.productId, valueLabel: '280' },
          { productId: trapecio390, valueLabel: '390' },
        ],
      },
      fx.userId,
    );
    const m280 = pub.members.find((m) => m.valueLabel === '280')!;
    await prisma.webVariant.create({
      data: {
        webProductId: pub.id,
        memberId: m280.id,
        sku: 'PTK-TEST-000001-V01',
        selectionKey: 'k1',
      },
    });

    const sinMiembros = await service.setMembers(
      pub.id,
      [{ productId: trapecio390, valueLabel: '390' }],
      fx.userId,
    );

    expect(sinMiembros.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ valueLabel: '280', isActive: false }),
        expect.objectContaining({ valueLabel: '390', isActive: true }),
      ]),
    );
    const variante = await prisma.webVariant.findUniqueOrThrow({
      where: { sku: 'PTK-TEST-000001-V01' },
    });
    expect(variante.isActive).toBe(false);

    // Volver a sumarlo lo reactiva.
    const otraVez = await service.setMembers(
      pub.id,
      [
        { productId: fx.productId, valueLabel: '280' },
        { productId: trapecio390, valueLabel: '390' },
      ],
      fx.userId,
    );
    expect(otraVez.members.every((m) => m.isActive)).toBe(true);
  });

  it('queda en la auditoría', async () => {
    const pub = await service.create({ name: 'Auditada' }, fx.userId);
    const entradas = await prisma.auditLog.findMany({
      where: { entity: 'WebProduct', entityId: pub.id },
    });
    expect(entradas.map((e) => e.action)).toEqual(['create']);
  });

  it('el listado trae el rango de precios y las alertas (F7·4)', async () => {
    await service.create(
      {
        name: 'Trapecio',
        members: [
          { productId: fx.productId, valueLabel: '280' },
          { productId: trapecio390, valueLabel: '390' },
        ],
      },
      fx.userId,
    );

    const [fila] = await service.list();
    // Los dos tienen precio (entrar a la tienda lo calcula); el 390 pesa más.
    expect(fila!.priceMin).not.toBeNull();
    expect(fila!.priceMax).toBeGreaterThan(fila!.priceMin!);
    expect(fila!.alerts).toEqual(['NO_IMAGES', 'NO_VARIANTS']);
    expect(fila!.coverImagePath).toBeNull();

    // La portada es la primera foto de la galería.
    for (const [position, path] of [
      [1, 'catalog/segunda.webp'],
      [0, 'catalog/portada.webp'],
    ] as const) {
      await prisma.webImage.create({
        data: { webProductId: fila!.id, path, width: 10, height: 10, position },
      });
    }
    const [conFotos] = await service.list();
    expect(conFotos!.coverImagePath).toBe('catalog/portada.webp');
    expect(conFotos!.alerts).toEqual(['NO_VARIANTS']);
  });
});
