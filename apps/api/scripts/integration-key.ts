/**
 * Claves de la API de integración (plan F11·1). La clave se imprime UNA vez:
 * el sistema guarda solo su hash. Se guarda en el secreto del otro sistema.
 *
 *   pnpm integration:issue-key <nombre> [alcance,alcance…]   (sin alcances: todos)
 *   pnpm integration:register <nombre> [alcances] < archivo   registra una clave ya generada
 *     (por ejemplo, el secreto storefront_api_key de infra); idempotente
 *   pnpm integration:revoke <id o comienzo de la clave>
 *   pnpm integration:list
 *
 * En el ecosistema, dentro del contenedor de la API:
 *   docker compose exec tienda3d-api ./node_modules/.bin/tsx scripts/integration-key.ts issue storefront
 */
import '../src/common/config/load-secret-files';
import { PrismaClient } from '@prisma/client';
import {
  INTEGRATION_SCOPES,
  generateIntegrationKey,
  hashIntegrationKey,
} from '../src/common/integration-auth/integration-keys';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function parseScopes(arg: string | undefined): string[] {
  const scopes = arg ? arg.split(',').map((s) => s.trim()) : [...INTEGRATION_SCOPES];
  const unknown = scopes.filter((s) => !(INTEGRATION_SCOPES as readonly string[]).includes(s));
  if (unknown.length) throw new Error(`Alcances desconocidos: ${unknown.join(', ')}`);
  return scopes;
}

async function main(): Promise<void> {
  const [command, arg, scopesArg] = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    if (command === 'issue' && arg) {
      const scopes = parseScopes(scopesArg);
      const { key, hash, prefix } = generateIntegrationKey();
      const client = await prisma.integrationClient.create({
        data: { name: arg, keyHash: hash, keyPrefix: prefix, scopes },
      });
      console.error(`Clave para "${arg}" (${client.id}), alcances: ${scopes.join(', ')}.`);
      console.error('Guardala ahora en el secreto del otro sistema: no se vuelve a mostrar.');
      // Solo la clave por stdout, para poder redirigirla a un archivo de secreto.
      console.log(key);
    } else if (command === 'register' && arg) {
      const scopes = parseScopes(scopesArg);
      const key = await readStdin();
      if (key.length < 32)
        throw new Error('La clave por stdin es demasiado corta (mínimo 32 caracteres).');
      const keyHash = hashIntegrationKey(key);
      const existing = await prisma.integrationClient.findUnique({ where: { keyHash } });
      if (existing) {
        console.log(`La clave ya estaba registrada para "${existing.name}" (${existing.id}).`);
      } else {
        const client = await prisma.integrationClient.create({
          data: { name: arg, keyHash, keyPrefix: key.slice(0, 9), scopes },
        });
        console.log(`Clave registrada para "${arg}" (${client.id}).`);
      }
    } else if (command === 'revoke' && arg) {
      const { count } = await prisma.integrationClient.updateMany({
        where: { revokedAt: null, OR: [{ id: arg }, { keyPrefix: { startsWith: arg } }] },
        data: { revokedAt: new Date() },
      });
      if (count === 0) throw new Error(`No hay una clave activa que coincida con "${arg}".`);
      console.log(`${count} clave(s) revocada(s).`);
    } else if (command === 'list') {
      const clients = await prisma.integrationClient.findMany({ orderBy: { createdAt: 'asc' } });
      for (const c of clients) {
        const state = c.revokedAt ? `revocada ${c.revokedAt.toISOString()}` : 'activa';
        const used = c.lastUsedAt ? c.lastUsedAt.toISOString() : 'nunca';
        console.log(
          `${c.id}  ${c.keyPrefix}…  ${c.name}  ${state}  último uso: ${used}  [${c.scopes.join(', ')}]`,
        );
      }
    } else {
      throw new Error(
        'Uso: integration-key.ts issue <nombre> [alcances] | register <nombre> [alcances] < clave | revoke <id|prefijo> | list',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
