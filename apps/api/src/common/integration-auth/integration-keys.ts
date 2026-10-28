import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Alcances de la API de integración (§5.5). Una clave nueva los recibe todos salvo que se elijan. */
export const INTEGRATION_SCOPES = [
  'ping',
  'orders:write',
  'orders:events',
  'customers:write',
  'quote-requests:write',
] as const;
export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

const KEY_PREFIX = 'tp_';

/** Clave nueva: 32 bytes aleatorios. Se muestra una sola vez; se guarda su hash. */
export function generateIntegrationKey(): { key: string; hash: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(32).toString('base64url');
  return { key, hash: hashIntegrationKey(key), prefix: key.slice(0, KEY_PREFIX.length + 6) };
}

export function hashIntegrationKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Compara dos hashes hex en tiempo constante. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
