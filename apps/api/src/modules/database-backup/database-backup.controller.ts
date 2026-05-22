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
@UseGuards(PermissionsGuard)
@Controller('admin/backup')
export class DatabaseBackupController {
  constructor(private readonly audit: AuditService) {}

  @Permissions('parameter:write')
  @Post()
  async create(@CurrentUser() user: AccessPayload, @Res() res: Response): Promise<void> {
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
    const proc = spawn('pg_dump', ['--no-owner', '--no-privileges', '-Fc', databaseUrl], {
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

    // Si el proceso falla ANTES de empezar a streamear (ej. pg_dump no
    // existe en el container), tenemos que cerrar la response con error.
    // Si falla DESPUÉS, la response ya está parcialmente enviada — solo
    // podemos cortarla.
    let responseStarted = false;
    proc.stdout.on('data', (chunk: Buffer) => {
      if (!responseStarted) responseStarted = true;
      res.write(chunk);
    });

    proc.on('error', (err) => {
      if (!responseStarted) {
        res.status(500).json({ error: `No se pudo iniciar pg_dump: ${err.message}` });
      } else {
        res.end();
      }
    });

    proc.on('close', (code) => {
      if (code !== 0 && !responseStarted) {
        res.status(500).json({
          error: `pg_dump terminó con código ${code}`,
          stderr: stderrBuffer.slice(0, 500),
        });
        return;
      }
      res.end();
      // Audit no bloqueante: registramos al cerrar el stream (éxito o
      // no). El audit log captura quién pidió un backup y cuándo.
      void this.audit
        .record({
          actorId: user.sub,
          entity: 'DatabaseBackup',
          entityId: filename,
          action: code === 0 ? 'create' : 'failed',
          before: null,
          after: { filename, exitCode: code },
        })
        .catch(() => undefined);
    });
  }
}
