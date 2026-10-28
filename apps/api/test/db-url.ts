/**
 * URL de la base de tests. Se resuelve una sola vez y la usan tanto el
 * globalSetup (para migrar) como cada spec (para conectarse).
 *
 * Default apuntando a localhost: los tests corren en el host, contra el puerto
 * publicado por el contenedor `db`.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tienda3d:changeme@localhost:5432/tienda3d_test?schema=public';

/**
 * Rol sin privilegios con el que se conecta la app en los tests, igual que en
 * producción (F2·6): lee y escribe datos, no cambia la estructura. Lo crea el
 * globalSetup y le aplica prisma/grants.sql.
 */
export const TEST_APP_ROLE = 'tienda3d_app_test';
const TEST_APP_PASSWORD = 'app-test-sin-privilegios';

export const TEST_APP_DATABASE_URL = (() => {
  const url = new URL(TEST_DATABASE_URL);
  url.username = TEST_APP_ROLE;
  url.password = TEST_APP_PASSWORD;
  return url.toString();
})();

export const TEST_APP_ROLE_SQL = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_APP_ROLE}') THEN
    CREATE ROLE ${TEST_APP_ROLE} LOGIN PASSWORD '${TEST_APP_PASSWORD}';
  END IF;
END $$`;

/**
 * Rol con el que el sitio lee el catálogo (storefront_reader), con los mismos
 * ajustes que le pone la infraestructura (db/init/00-roles.sh). Lo crea el
 * globalSetup y le aplica prisma/grants-reader.sql (F10·2).
 */
export const TEST_READER_ROLE = 'storefront_reader_test';
const TEST_READER_PASSWORD = 'reader-test-solo-lectura';

export const TEST_READER_DATABASE_URL = (() => {
  const url = new URL(TEST_DATABASE_URL);
  url.username = TEST_READER_ROLE;
  url.password = TEST_READER_PASSWORD;
  url.search = '';
  return url.toString();
})();

export const TEST_READER_ROLE_SQL = [
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_READER_ROLE}') THEN
    CREATE ROLE ${TEST_READER_ROLE} LOGIN PASSWORD '${TEST_READER_PASSWORD}';
  END IF;
END $$`,
  `ALTER ROLE ${TEST_READER_ROLE} SET default_transaction_read_only = on`,
  `ALTER ROLE ${TEST_READER_ROLE} SET statement_timeout = '5s'`,
  `ALTER ROLE ${TEST_READER_ROLE} SET idle_in_transaction_session_timeout = '10s'`,
  `ALTER ROLE ${TEST_READER_ROLE} SET search_path = storefront_v1`,
  `ALTER ROLE ${TEST_READER_ROLE} CONNECTION LIMIT 10`,
];
