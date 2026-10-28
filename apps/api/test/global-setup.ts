import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  TEST_APP_ROLE,
  TEST_APP_ROLE_SQL,
  TEST_DATABASE_URL,
  TEST_READER_ROLE,
  TEST_READER_ROLE_SQL,
} from './db-url';

/**
 * Aplica las migraciones sobre la base de tests, una vez por corrida.
 *
 * Se usa `migrate deploy` (no `db push`) a propósito: así la suite valida el
 * MISMO SQL que se va a correr en producción, incluido lo que Prisma no sabe
 * expresar en el schema — como el índice único parcial de F-11.
 *
 * Después crea el rol sin privilegios de la app y le aplica prisma/grants.sql,
 * igual que scripts/migrate.sh: toda la suite corre conectada con ese rol.
 */
export default async function globalSetup(): Promise<void> {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });

  const owner = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    await owner.$executeRawUnsafe(TEST_APP_ROLE_SQL);
    for (const statement of grantStatements('grants.sql', 'app_role', TEST_APP_ROLE)) {
      await owner.$executeRawUnsafe(statement);
    }
    // El lector del sitio, como lo deja scripts/migrate.sh con READER_DB_ROLE.
    for (const statement of TEST_READER_ROLE_SQL) await owner.$executeRawUnsafe(statement);
    for (const statement of grantStatements('grants-reader.sql', 'reader_role', TEST_READER_ROLE)) {
      await owner.$executeRawUnsafe(statement);
    }
  } finally {
    await owner.$disconnect();
  }
}

/** Las sentencias de un prisma/grants*.sql con el rol reemplazado (sin psql en el host). */
export function grantStatements(file: string, variable: string, role: string): string[] {
  const sql = readFileSync(join(__dirname, '..', 'prisma', file), 'utf8');
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replaceAll(`:"${variable}"`, `"${role}"`));
}
