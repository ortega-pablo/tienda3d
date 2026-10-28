import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { bootTestApp } from '../../../test/harness';

/**
 * F2·6: la API se conecta con un rol sin privilegios (prisma/grants.sql). Una
 * falla en la API no puede cambiar la estructura de la base ni el historial
 * de migraciones. Toda la suite de integración corre con este mismo rol.
 */
describe('[int] Permisos del rol de la API', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
  });

  afterAll(async () => {
    await close();
  });

  it('la app se conecta con el rol sin privilegios', async () => {
    const [row] = await prisma.$queryRaw<Array<{ current_user: string }>>`SELECT current_user`;
    expect(row!.current_user).toBe('tienda3d_app_test');
    expect(moduleRef).toBeDefined();
  });

  it('no puede crear ni borrar tablas', async () => {
    await expect(prisma.$executeRawUnsafe('CREATE TABLE intruso (id int)')).rejects.toThrow(
      /permission denied/,
    );
    await expect(prisma.$executeRawUnsafe('DROP TABLE products')).rejects.toThrow(
      /must be owner|permission denied/,
    );
  });

  it('no puede vaciar tablas ni tocar el historial de migraciones', async () => {
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE audit_logs')).rejects.toThrow(
      /permission denied/,
    );
    await expect(prisma.$executeRawUnsafe('DELETE FROM _prisma_migrations')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('sí puede leer, escribir y usar secuencias', async () => {
    await expect(prisma.globalParam.count()).resolves.toBeGreaterThanOrEqual(0);
    const [seq] = await prisma.$queryRaw<
      Array<{ next: bigint }>
    >`SELECT nextval('product_sku_seq') AS next`;
    expect(Number(seq!.next)).toBeGreaterThan(0);
  });
});
