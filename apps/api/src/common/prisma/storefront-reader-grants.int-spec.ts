import { PrismaClient } from '@prisma/client';
import { grantStatements } from '../../../test/global-setup';
import {
  TEST_DATABASE_URL,
  TEST_READER_DATABASE_URL,
  TEST_READER_ROLE,
} from '../../../test/db-url';

/**
 * F10·2: después de una migración el sitio sigue leyendo sin pasos manuales.
 * Una vista nueva nace legible (default privileges) y una recreada recupera el
 * permiso con prisma/grants-reader.sql, que scripts/migrate.sh corre siempre.
 */
describe('[int] Permisos del lector del sitio después de migrar', () => {
  let owner: PrismaClient;
  let reader: PrismaClient;

  beforeAll(() => {
    owner = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    reader = new PrismaClient({ datasources: { db: { url: TEST_READER_DATABASE_URL } } });
  });

  afterAll(async () => {
    await owner.$executeRawUnsafe('DROP VIEW IF EXISTS storefront_v1.sonda_migracion');
    await owner.$disconnect();
    await reader.$disconnect();
  });

  const reapplyGrants = async () => {
    for (const s of grantStatements('grants-reader.sql', 'reader_role', TEST_READER_ROLE)) {
      await owner.$executeRawUnsafe(s);
    }
  };

  it('una vista nueva de una migración se puede leer sin tocar permisos', async () => {
    await owner.$executeRawUnsafe(
      'CREATE VIEW storefront_v1.sonda_migracion WITH (security_barrier) AS SELECT 1 AS ok',
    );
    expect(await reader.$queryRawUnsafe('SELECT ok FROM storefront_v1.sonda_migracion')).toEqual([
      { ok: 1 },
    ]);
  });

  it('una vista recreada vuelve a ser legible al reaplicar los permisos', async () => {
    const [row] = await owner.$queryRawUnsafe<Array<{ def: string }>>(
      "SELECT pg_get_viewdef('storefront_v1.slug_redirects'::regclass, true) AS def",
    );
    const def = row!.def;
    // Lo que hace una migración que cambia una vista: la borra y la crea de nuevo.
    await owner.$executeRawUnsafe('DROP VIEW storefront_v1.slug_redirects');
    await owner.$executeRawUnsafe(
      `CREATE VIEW storefront_v1.slug_redirects WITH (security_barrier) AS ${def}`,
    );
    // Si quien migra no es el que dejó los default privileges, se pierde el
    // permiso: por eso migrate.sh reaplica siempre grants-reader.sql.
    await owner.$executeRawUnsafe(
      `REVOKE SELECT ON storefront_v1.slug_redirects FROM ${TEST_READER_ROLE}`,
    );
    await expect(
      reader.$queryRawUnsafe('SELECT * FROM storefront_v1.slug_redirects'),
    ).rejects.toThrow(/permission denied/);

    await reapplyGrants();
    await expect(
      reader.$queryRawUnsafe('SELECT * FROM storefront_v1.slug_redirects'),
    ).resolves.toEqual([]);
  });

  it('los permisos se pueden aplicar dos veces seguidas', async () => {
    await reapplyGrants();
    await reapplyGrants();
    await expect(reader.$queryRawUnsafe('SELECT * FROM storefront_v1.products')).resolves.toEqual(
      expect.any(Array),
    );
  });
});
