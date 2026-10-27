/**
 * Validación de secretos al arranque.
 *
 * `ConfigService.getOrThrow` sólo verifica que la variable EXISTA. El `.env`
 * del taller siguió con los valores del `.env.example` (`replace-with-…`,
 * `changeme`), que son cadenas públicas de este repositorio: cualquiera que vea
 * el repo puede firmar un JWT válido.
 *
 * En producción esto aborta el arranque. En desarrollo sólo advierte, para no
 * romper el `docker compose up` de alguien que recién clona.
 */

/**
 * Valores públicos que nunca deben llegar a producción: los del .env.example de
 * este repo y del sitio (tienda-plastik-page), y contraseñas de manual.
 */
export const EXAMPLE_VALUES = [
  'replace-with-32-byte-random-string',
  'replace-with-another-32-byte-random',
  'changeme',
  'admin123',
  'cambiar-esta-clave',
  'plastik-dev',
  'postgres',
  'password',
];

const MIN_SECRET_LENGTH = 32;
const MIN_DB_PASSWORD_LENGTH = 16;
const MIN_ADMIN_PASSWORD_LENGTH = 12;

/** Credenciales que necesita cada integración cuando su flag está en `true`. */
const INTEGRATION_CREDENTIALS: Record<string, string[]> = {
  MELI: ['MELI_CLIENT_ID', 'MELI_CLIENT_SECRET'],
  ARCA: ['ARCA_CUIT', 'ARCA_CERT'],
  WHATSAPP: ['WHATSAPP_PHONE_ID', 'WHATSAPP_TOKEN'],
};

export interface SecretIssue {
  variable: string;
  reason: string;
}

export function findSecretIssues(env: NodeJS.ProcessEnv): SecretIssue[] {
  const issues: SecretIssue[] = [];
  for (const variable of ['JWT_SECRET', 'REFRESH_SECRET']) {
    const value = env[variable];
    if (!value) {
      issues.push({ variable, reason: 'no está definida' });
      continue;
    }
    if (EXAMPLE_VALUES.includes(value)) {
      issues.push({ variable, reason: 'sigue con el valor de ejemplo del .env.example' });
    } else if (value.length < MIN_SECRET_LENGTH) {
      issues.push({
        variable,
        reason: `tiene ${value.length} caracteres; se esperan al menos ${MIN_SECRET_LENGTH}`,
      });
    }
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.REFRESH_SECRET) {
    issues.push({
      variable: 'REFRESH_SECRET',
      reason: 'es igual a JWT_SECRET; un access token serviría como refresh',
    });
  }
  if (env.DATABASE_URL) {
    const reason = databasePasswordIssue(env.DATABASE_URL);
    if (reason) issues.push({ variable: 'DATABASE_URL', reason });
  }
  for (const [integration, variables] of Object.entries(INTEGRATION_CREDENTIALS)) {
    if (env[`INTEGRATION_${integration}_ENABLED`] !== 'true') continue;
    for (const variable of variables) {
      if (!env[variable]) {
        issues.push({ variable, reason: `falta y INTEGRATION_${integration}_ENABLED=true` });
      }
    }
  }
  return issues;
}

/** Problema de la contraseña embebida en una URL de Postgres, o `null` si está bien. */
export function databasePasswordIssue(databaseUrl: string): string | null {
  let password = '';
  try {
    password = decodeURIComponent(new URL(databaseUrl).password);
  } catch {
    return 'no es una URL válida';
  }
  if (!password) return 'la conexión a la base no tiene contraseña';
  if (EXAMPLE_VALUES.includes(password)) return 'la contraseña de la base es un valor de ejemplo';
  if (password.length < MIN_DB_PASSWORD_LENGTH) {
    return `la contraseña de la base tiene ${password.length} caracteres; se esperan al menos ${MIN_DB_PASSWORD_LENGTH}`;
  }
  return null;
}

/**
 * Problema de la contraseña del admin inicial del seed, o `null` si está bien.
 * En producción el seed no crea un admin con una clave débil o pública.
 */
export function seedAdminPasswordIssue(password: string | undefined): string | null {
  if (!password) return 'SEED_ADMIN_PASSWORD no está definida (ni SEED_ADMIN_PASSWORD_FILE)';
  if (EXAMPLE_VALUES.includes(password)) return 'SEED_ADMIN_PASSWORD es un valor de ejemplo';
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return `SEED_ADMIN_PASSWORD tiene ${password.length} caracteres; se esperan al menos ${MIN_ADMIN_PASSWORD_LENGTH}`;
  }
  return null;
}

export function assertSecrets(env: NodeJS.ProcessEnv, isProduction: boolean): void {
  const issues = findSecretIssues(env);
  if (issues.length === 0) return;

  const detail = issues.map((i) => `  - ${i.variable}: ${i.reason}`).join('\n');
  if (isProduction) {
    throw new Error(
      `Secretos inseguros, no se arranca en producción:\n${detail}\n` +
        'Generá valores nuevos con `openssl rand -base64 32` y reiniciá.',
    );
  }
  console.warn(`⚠️  Secretos inseguros (tolerado en desarrollo):\n${detail}`);
}
