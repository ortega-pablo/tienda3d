import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './db-url';

/**
 * Aplica las migraciones sobre la base de tests, una vez por corrida.
 *
 * Se usa `migrate deploy` (no `db push`) a propósito: así la suite valida el
 * MISMO SQL que se va a correr en producción, incluido lo que Prisma no sabe
 * expresar en el schema — como el índice único parcial de F-11.
 */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
