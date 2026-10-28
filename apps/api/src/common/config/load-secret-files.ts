/**
 * Efecto de lado: carga los secretos que vienen de archivo (`NOMBRE_FILE`) en
 * `process.env`. Va importado PRIMERO en `main.ts` y en el seed: el
 * `ConfigModule` lee el entorno al importarse `AppModule`, y Prisma lee
 * `DATABASE_URL` al crearse el cliente.
 */
import { loadSecretFiles } from './secret-files';

loadSecretFiles(process.env);
