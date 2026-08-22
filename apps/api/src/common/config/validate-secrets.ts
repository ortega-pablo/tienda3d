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

/** Valores del .env.example que nunca deben llegar a producción. */
const EXAMPLE_VALUES = [
  'replace-with-32-byte-random-string',
  'replace-with-another-32-byte-random',
  'changeme',
  'admin123',
];

const MIN_SECRET_LENGTH = 32;

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
  return issues;
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
