import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { bootTestApp, truncateAll } from '../../../test/harness';
import { WebOrdersService } from './web-orders.service';

/** F14·2: el código de los pedidos web es correlativo por año de Argentina. */
describe('[int] Código de los pedidos web', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let orders: WebOrdersService;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    orders = moduleRef.get(WebOrdersService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('W-AAAA-NNNN, uno detrás de otro', async () => {
    const at = new Date('2026-10-29T15:00:00Z');
    expect(await orders.nextCode(undefined, at)).toBe('W-2026-0001');
    expect(await orders.nextCode(undefined, at)).toBe('W-2026-0002');
  });

  it('con pedidos simultáneos no se repite ningún código', async () => {
    const at = new Date('2026-10-29T15:00:00Z');
    const codes = await Promise.all(
      Array.from({ length: 8 }, () => orders.nextCode(undefined, at)),
    );
    expect(new Set(codes).size).toBe(8);
    expect(codes.sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `W-2026-${String(i + 1).padStart(4, '0')}`),
    );
  });

  it('el año es el de Argentina y cada año empieza de nuevo', async () => {
    // 31/12/2026 23:30 en Argentina (ya es 2027 en UTC).
    expect(await orders.nextCode(undefined, new Date('2027-01-01T02:30:00Z'))).toBe('W-2026-0001');
    expect(await orders.nextCode(undefined, new Date('2027-01-01T03:30:00Z'))).toBe('W-2027-0001');
  });
});
