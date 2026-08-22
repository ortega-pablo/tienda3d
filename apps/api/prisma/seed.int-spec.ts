import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL } from '../test/db-url';

/**
 * El seed corre sobre bases EXISTENTES: el README lo documenta como operación
 * normal. Estos tests lo ejecutan dos veces seguidas y verifican que la segunda
 * no destruya nada — que es exactamente lo que hacía antes (F-01 y F-26).
 */
describe('[int] Idempotencia del seed', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

  const runSeed = () =>
    execSync('npx tsx prisma/seed.ts', {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, SEED_ADMIN_PASSWORD: 'test1234' },
      stdio: 'pipe',
    });

  const permissionsByRole = async () => {
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return Object.fromEntries(
      roles.map((r) => [r.name, r.permissions.map((p) => p.permission.key).sort()]),
    );
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeAll(() => {
    runSeed();
  });

  /**
   * F-01: `seedRoles` borraba TODAS las filas de role_permissions y las recreaba
   * desde su constante, que no incluía los permisos agregados por migraciones
   * posteriores. Correr el seed dejaba a admin/operator/viewer sin customer:*.
   */
  it('no pierde permisos al correrlo de nuevo', async () => {
    const before = await permissionsByRole();
    expect(before.admin).toContain('customer:read');
    expect(before.admin).toContain('customer:write');

    runSeed();

    expect(await permissionsByRole()).toEqual(before);
  });

  it('no le da permisos de portal a los roles de staff', async () => {
    const perms = await permissionsByRole();
    for (const role of ['admin', 'operator', 'viewer']) {
      expect(perms[role]!.filter((p) => p.startsWith('portal:'))).toEqual([]);
    }
    // El operador gestiona clientes pero no sus cuentas de portal.
    expect(perms.operator).toContain('customer:write');
    expect(perms.operator).not.toContain('customer:portal:manage');
    expect(perms.viewer).toContain('customer:read');
    expect(perms.viewer).not.toContain('customer:write');
  });

  it('conserva los permisos que un admin agregó desde la UI', async () => {
    const viewer = await prisma.role.findUniqueOrThrow({ where: { name: 'viewer' } });
    const extra = await prisma.permission.findUniqueOrThrow({ where: { key: 'quote:export' } });
    await prisma.rolePermission.create({
      data: { roleId: viewer.id, permissionId: extra.id },
    });

    runSeed();

    const perms = await permissionsByRole();
    expect(perms.viewer).toContain('quote:export');
  });

  /**
   * F-26: `seedGlobalParams` hacía `update: { value }`, así que re-correr el
   * seed reseteaba TODO parámetro ajustado. En la base del taller
   * design_hour_cost estaba en 7500 y el seed lo habría vuelto a 0, dejando
   * todos los cargos de diseño en cero sin ningún aviso.
   */
  it('no pisa los parámetros globales que el taller ajustó', async () => {
    await prisma.globalParam.update({
      where: { key: 'design_hour_cost' },
      data: { value: '7500' },
    });
    await prisma.globalParam.update({
      where: { key: 'labor_hour_cost' },
      data: { value: '9999' },
    });

    runSeed();

    const design = await prisma.globalParam.findUniqueOrThrow({
      where: { key: 'design_hour_cost' },
    });
    const labor = await prisma.globalParam.findUniqueOrThrow({
      where: { key: 'labor_hour_cost' },
    });
    expect(design.value).toBe('7500');
    expect(labor.value).toBe('9999');
  });
});
