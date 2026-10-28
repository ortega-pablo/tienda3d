import { readFileSync } from 'node:fs';

/**
 * Secretos que pueden venir de un archivo.
 *
 * En Docker los secretos se montan como archivos en `/run/secrets/<nombre>` y el
 * contenedor recibe `NOMBRE_FILE=/run/secrets/<nombre>`: así no aparecen en
 * `docker inspect` ni en la configuración del compose. Si existe `NOMBRE_FILE`,
 * gana sobre `NOMBRE`.
 */
export const SECRET_VARIABLES = [
  'DATABASE_URL',
  'JWT_SECRET',
  'REFRESH_SECRET',
  'SEED_ADMIN_PASSWORD',
  'MELI_CLIENT_SECRET',
  'MELI_REFRESH_TOKEN',
  'ARCA_CERT',
  'ARCA_KEY',
  'WHATSAPP_TOKEN',
  // Firma de los avisos al sitio (F11·3).
  'EVENTS_SECRET_T3D_TO_SF',
] as const;

/** Valor de un secreto: el contenido de `NOMBRE_FILE` si está definido, si no `NOMBRE`. */
export function readSecret(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const file = env[`${name}_FILE`];
  if (!file) return env[name];
  try {
    // Un salto de línea final es lo normal en un archivo editado a mano o con `echo`.
    return readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  } catch (err) {
    throw new Error(`No se pudo leer ${name}_FILE (${file}): ${(err as Error).message}`);
  }
}

/**
 * Copia a `env` los secretos que vienen de archivo. Corre antes de que Nest y
 * Prisma lean la configuración (ver `load-secret-files.ts`).
 */
export function loadSecretFiles(
  env: NodeJS.ProcessEnv = process.env,
  names: readonly string[] = SECRET_VARIABLES,
): void {
  for (const name of names) {
    if (env[`${name}_FILE`]) env[name] = readSecret(name, env);
  }
}
