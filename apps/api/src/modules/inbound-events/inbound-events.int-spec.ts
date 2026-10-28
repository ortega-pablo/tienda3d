import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { bootTestApp, truncateAll } from '../../../test/harness';
import { InboundEventsService } from './inbound-events.service';

/**
 * F11·4: mandar dos veces lo mismo produce un solo efecto. El efecto de prueba
 * es real (crea un cliente), como lo será registrar un pedido o un cliente web.
 */
describe('[int] Idempotencia de lo que pide el sitio', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: InboundEventsService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    service = moduleRef.get(InboundEventsService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.inboundEvent.deleteMany();
  });

  /** Lo que haría "registrar el cliente web": crea una fila y devuelve su id. */
  const registrarCliente = (nombre: string) =>
    service.once('storefront:customers', 'web-cliente-1', async (tx) => {
      const customer = await tx.customer.create({ data: { name: nombre } });
      return { customerId: customer.id };
    });

  it('el mismo aviso dos veces produce un solo efecto y la misma respuesta', async () => {
    const primero = await registrarCliente('Ana');
    const segundo = await registrarCliente('Ana');

    expect(primero.replayed).toBe(false);
    expect(segundo).toEqual({ result: primero.result, replayed: true });
    expect(await prisma.customer.count()).toBe(1);
  });

  it('dos avisos iguales a la vez también producen uno solo', async () => {
    const results = await Promise.all([registrarCliente('Ana'), registrarCliente('Ana')]);

    expect(await prisma.customer.count()).toBe(1);
    expect(results.filter((r) => r.replayed)).toHaveLength(1);
    expect(results[0]!.result).toEqual(results[1]!.result);
  });

  it('si el efecto falla, la clave no queda tomada y el reintento lo aplica', async () => {
    await expect(
      service.once('storefront:customers', 'web-cliente-1', async (tx) => {
        await tx.customer.create({ data: { name: 'Ana' } });
        throw new Error('se cortó a mitad de camino');
      }),
    ).rejects.toThrow(/a mitad de camino/);
    expect(await prisma.customer.count()).toBe(0);

    const reintento = await registrarCliente('Ana');
    expect(reintento.replayed).toBe(false);
    expect(await prisma.customer.count()).toBe(1);
  });

  it('la misma clave en otra fuente es otro aviso', async () => {
    await registrarCliente('Ana');
    const otro = await service.once('storefront:orders', 'web-cliente-1', () =>
      Promise.resolve({ orderCode: 'W-2026-0001' }),
    );
    expect(otro).toEqual({ result: { orderCode: 'W-2026-0001' }, replayed: false });
  });
});
