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
