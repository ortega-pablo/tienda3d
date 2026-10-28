import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import type { AccessPayload } from '../auth/auth.service';
import { ProductsController } from './products.controller';
import { ProductsService, type ProductInput } from './products.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F2·2: guardar la ficha de un producto no cambia lo que el payload no trae.
 * La tienda online publica según `isActive` y el canal Venta Directa, así que
 * un PUT que los pisaba en silencio terminaba publicando lo que no se quería.
 */
describe('[int] Editar un producto', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: ProductsService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let machineId: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    service = moduleRef.get(ProductsService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    machineId = (await prisma.machine.findFirstOrThrow()).id;
  });

  /** Lo que manda el editor al guardar, sin `isActive` ni `channels`. */
  const payload = (): ProductInput => ({
    name: 'Producto test editado',
    description: null,
    marketingMonthly: 0,
    estimatedUnitsMonth: 1,
    assemblyMinutes: 6,
    managementMinutes: 4,
    machineId,
    categoryId: fx.categoryId,
    pieces: [{ name: 'Cuerpo', grams: 55, printMinutes: 90, defaultFilamentId: fx.filamentId }],
    materials: [{ materialId: fx.materialId, quantity: 2 }],
  });

  it('un producto archivado sigue archivado si el payload no trae isActive', async () => {
    await prisma.product.update({ where: { id: fx.productId }, data: { isActive: false } });

    await service.update(fx.productId, payload());

    const product = await prisma.product.findUniqueOrThrow({ where: { id: fx.productId } });
    expect(product.isActive).toBe(false);
    expect(product.name).toBe('Producto test editado');
  });

  it('Venta Directa apagada sigue apagada si el payload no trae canales', async () => {
    // El canal del fixture pasa a ser de sistema: es el que el PUT viejo re-habilitaba.
    await prisma.channel.update({ where: { id: fx.channelId }, data: { isSystem: true } });
    await prisma.productChannel.updateMany({
      where: { productId: fx.productId, channelId: fx.channelId },
      data: { isEnabled: false },
    });

    await service.update(fx.productId, payload());

    const link = await prisma.productChannel.findUniqueOrThrow({
      where: { productId_channelId: { productId: fx.productId, channelId: fx.channelId } },
    });
    expect(link.isEnabled).toBe(false);
  });

  it('la respuesta del PUT no muestra las notas a quien no tiene parameter:write', async () => {
    await prisma.product.update({
      where: { id: fx.productId },
      data: { notes: 'Costo real con descuento del proveedor' },
    });
    const controller = moduleRef.get(ProductsController);
    const operador = {
      sub: fx.userId,
      email: 'op@plastik.local',
      role: 'operator',
      permissions: ['product:write'],
    } as AccessPayload;

    const body = payload() as Parameters<ProductsController['update']>[1];
    const response = await controller.update(fx.productId, body, operador);

    expect(response.notes ?? null).toBeNull();
    // ...y las notas se conservan en la base.
    const product = await prisma.product.findUniqueOrThrow({ where: { id: fx.productId } });
    expect(product.notes).toBe('Costo real con descuento del proveedor');
  });
});

/**
 * F2·3: las piezas conservan su id al editar. Antes el PUT las borraba y
 * recreaba, y nada podía referenciarlas (colores de la tienda online,
 * `filamentOverrides` de las órdenes de producción).
 */
describe('[int] Piezas al editar un producto', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: ProductsService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let machineId: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    service = moduleRef.get(ProductsService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    machineId = (await prisma.machine.findFirstOrThrow()).id;
  });

  const base = (pieces: ProductInput['pieces']): ProductInput => ({
    name: 'Producto test',
    marketingMonthly: 0,
    estimatedUnitsMonth: 1,
    assemblyMinutes: 6,
    managementMinutes: 4,
    machineId,
    categoryId: fx.categoryId,
    pieces,
    materials: [{ materialId: fx.materialId, quantity: 2 }],
  });

  it('editar los gramos de una pieza mantiene su id', async () => {
    const [cuerpo] = await prisma.productPiece.findMany({ where: { productId: fx.productId } });

    const result = await service.update(
      fx.productId,
      base([
        {
          id: cuerpo!.id,
          name: 'Cuerpo',
          grams: 80,
          printMinutes: 90,
          defaultFilamentId: fx.filamentId,
        },
      ]),
    );

    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]!.id).toBe(cuerpo!.id);
    expect(Number(result.pieces[0]!.grams)).toBe(80);
  });

  it('agregar una pieza la crea y quitar otra la borra, sin tocar las que quedan', async () => {
    const [cuerpo] = await prisma.productPiece.findMany({ where: { productId: fx.productId } });
    const conTapa = await service.update(
      fx.productId,
      base([
        {
          id: cuerpo!.id,
          name: 'Cuerpo',
          grams: 50,
          printMinutes: 90,
          defaultFilamentId: fx.filamentId,
        },
        { name: 'Tapa', grams: 10, printMinutes: 20, defaultFilamentId: fx.filamentId },
      ]),
    );
    const tapa = conTapa.pieces.find((p) => p.name === 'Tapa')!;

    const sinCuerpo = await service.update(
      fx.productId,
      base([
        {
          id: tapa.id,
          name: 'Tapa',
          grams: 12,
          printMinutes: 20,
          defaultFilamentId: fx.filamentId,
        },
      ]),
    );

    expect(sinCuerpo.pieces.map((p) => p.id)).toEqual([tapa.id]);
    expect(await prisma.productPiece.count({ where: { id: cuerpo!.id } })).toBe(0);
  });

  it('un id de pieza de otro producto se trata como pieza nueva y no la toca', async () => {
    const otro = await prisma.product.create({
      data: {
        name: 'Otro',
        sku: 'PTK-TEST-000002',
        categoryId: fx.categoryId,
        pieces: {
          create: [{ name: 'Ajena', grams: 5, printMinutes: 5, defaultFilamentId: fx.filamentId }],
        },
      },
      include: { pieces: true },
    });
    const ajena = otro.pieces[0]!;

    const result = await service.update(
      fx.productId,
      base([
        {
          id: ajena.id,
          name: 'Pirata',
          grams: 99,
          printMinutes: 9,
          defaultFilamentId: fx.filamentId,
        },
      ]),
    );

    expect(result.pieces[0]!.id).not.toBe(ajena.id);
    const intacta = await prisma.productPiece.findUniqueOrThrow({ where: { id: ajena.id } });
    expect(intacta).toMatchObject({ name: 'Ajena', productId: otro.id });
  });
});
