/**
 * Importa el catálogo de la web al sistema (plan F9·2). Vive en src/ para que
 * se compile con la API: el lanzamiento repite F9 con los datos del día
 * (F20·1), dentro de la imagen de producción.
 *
 *   pnpm build && pnpm catalog:import --from <carpeta> [--line PLA-GENERICO] [--actor email] [--dry-run]
 *
 * <carpeta> es `storefront/prisma/seed` (catalog.json + media/). Corre
 * compilado: tsx no emite la metadata de decoradores que usa la inyección de
 * Nest. En la imagen (o en el contenedor de desarrollo, que compila en dist/):
 *   node dist/modules/catalog-import/import-storefront-catalog.cli.js --from /import --dry-run
 */
import 'reflect-metadata';
// Primero: los secretos de archivo (DATABASE_URL_FILE…), antes de leer la config.
import '@/common/config/load-secret-files';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { StorefrontCatalogImporter } from './storefront-catalog-importer';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      line: { type: 'string', default: 'PLA-GENERICO' },
      actor: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!values.from) throw new Error('Falta --from <carpeta con catalog.json y media/>.');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    // Los trabajos periódicos (avisos al sitio, recálculo de precios) son de la API.
    const scheduler = app.get(SchedulerRegistry);
    for (const name of scheduler.getIntervals()) scheduler.deleteInterval(name);
    for (const name of scheduler.getCronJobs().keys()) scheduler.deleteCronJob(name);

    const prisma = app.get(PrismaService);
    const actor = await prisma.user.findFirst({
      where: values.actor
        ? { email: values.actor, isActive: true }
        : { isActive: true, role: { name: 'admin' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    if (!actor) {
      throw new Error(
        `No hay un usuario activo ${values.actor ?? 'admin'} para firmar la importación.`,
      );
    }
    console.log(`Importa: ${actor.email}`);

    const summary = await StorefrontCatalogImporter.from(app).run({
      from: resolve(values.from),
      line: values.line,
      actorId: actor.id,
      dryRun: values['dry-run'],
      log: (line) => console.log(line),
    });
    if (summary.failed) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
