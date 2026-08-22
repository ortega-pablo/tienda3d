import { Controller, InternalServerErrorException, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { spawn } from 'node:child_process';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { AuditService } from '@/modules/audit/audit.service';
import type { AccessPayload } from '../auth/auth.service';

/**
 * Endpoint admin para generar un backup en formato `pg_dump -Fc` y
 * devolverlo como descarga al browser. El usuario lo guarda donde
 * quiera (típicamente en una carpeta de iCloud Drive sincronizada).
 *
 * Implementación:
 *   - Spawnea `pg_dump` con `DATABASE_URL` del proceso. La imagen
 *     incluye `postgresql16-client` para que el binario esté disponible.
 *   - Streamea stdout a la response — no se guarda nada en disco del
 *     container. El cliente recibe el dump tal como sale.
 *   - Permiso `parameter:write` (mismo que edita params globales).
 *   - Cada backup queda registrado en el audit log con el id del actor.
 */
/** Tiempo máximo que puede tardar un dump antes de cortarlo. */
const DUMP_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Parámetros de query que entiende Prisma pero NO libpq. Pasarle
 * `?schema=public` a pg_dump lo hace abortar con "invalid URI query parameter",
 * así que el endpoint de backup fallaba siempre — y el `.env.example` trae ese
 * parámetro, o sea que fallaba en toda instalación.
 */
const PRISMA_ONLY_PARAMS = [
  'schema',
  'connection_limit',
  'connect_timeout',
  'pool_timeout',
  'pgbouncer',
  'socket_timeout',
  'sslidentity',
  'sslpassword',
  'sslcert',
];

/** Deja la connection string en algo que libpq acepte. */
export function toLibpqUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    for (const param of PRISMA_ONLY_PARAMS) url.searchParams.delete(param);
    // Sin params no dejamos el '?' colgando.
    if ([...url.searchParams].length === 0) url.search = '';
    return url.toString();
  } catch {
    // Si no parsea como URL, cortamos la query a mano antes que romper.
    return databaseUrl.split('?')[0] ?? databaseUrl;
  }
}

@UseGuards(PermissionsGuard)
@Controller('admin/backup')
export class DatabaseBackupController {
  constructor(private readonly audit: AuditService) {}

  @Permissions('parameter:write')
  @Post()
  create(@CurrentUser() user: AccessPayload, @Res() res: Response): void {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new InternalServerErrorException('DATABASE_URL no configurada');
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `tienda3d_${stamp}.dump`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // `pg_dump -Fc` produce el formato custom (comprimido + restore selectivo).
    // Pasamos DATABASE_URL como argumento posicional — pg_dump acepta connection
    // strings desde la versión 9.6+, lo cual está cubierto por nuestra imagen.
    const proc = spawn('pg_dump', ['--no-owner', '--no-privileges', '-Fc', toLibpqUrl(databaseUrl)], {
      // Si las env vars del proceso tienen PGPASSWORD/etc no las pasamos al
      // child para evitar override accidental — DATABASE_URL ya tiene las
      // credenciales embebidas.
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        LANG: process.env.LANG ?? 'C',
      },
    });

    let stderrBuffer = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    // Corte por tiempo: un pg_dump colgado (lock en la base, red caída contra
    // un RDS) no puede quedar corriendo indefinidamente ocupando una conexión.
    const timeout = setTimeout(() => {
      stderrBuffer += `\nTimeout de ${DUMP_TIMEOUT_MS / 1000}s alcanzado.`;
      proc.kill('SIGTERM');
    }, DUMP_TIMEOUT_MS);

    // `pipe` en vez de un `on('data')` manual: respeta la contrapresión sola.
    // Con la escritura manual, un cliente que descarga más lento de lo que
    // Postgres dumpea —habitual sobre el Wi-Fi del taller— hacía crecer el
    // buffer de la respuesta en memoria sin techo.
    proc.stdout.pipe(res);

    // Si el cliente cancela la descarga, matamos el dump: si no, el proceso
    // queda huérfano ocupando una conexión a la base.
    let finished = false;
    res.on('close', () => {
      if (!finished) proc.kill('SIGTERM');
    });

    const audit = (code: number | null, cancelled: boolean) =>
      void this.audit
        .record({
          actorId: user.sub,
          entity: 'DatabaseBackup',
          entityId: filename,
          action: code === 0 && !cancelled ? 'create' : 'failed',
          before: null,
          after: {
            filename,
            exitCode: code,
            ...(cancelled ? { cancelled: true } : {}),
            ...(stderrBuffer ? { stderr: stderrBuffer.slice(0, 500) } : {}),
          },
        })
        .catch(() => undefined);

    proc.on('error', (err) => {
      finished = true;
      clearTimeout(timeout);
      if (!res.headersSent) {
        res.status(500).json({ error: `No se pudo iniciar pg_dump: ${err.message}` });
      } else {
        res.end();
      }
      audit(null, false);
    });

    proc.on('close', (code) => {
      finished = true;
      clearTimeout(timeout);
      const cancelled = res.destroyed;
      // Si el proceso falló ANTES de emitir el primer byte, la respuesta sigue
      // sin cabeceras y todavía se puede convertir en un error legible.
      if (code !== 0 && !res.headersSent) {
        res.status(500).json({
          error: `pg_dump terminó con código ${code}`,
          stderr: stderrBuffer.slice(0, 500),
        });
      } else if (!res.writableEnded) {
        res.end();
      }
      // El audit registra tanto el éxito como el fallo y la cancelación.
      audit(code, cancelled);
    });
  }
}
