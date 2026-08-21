import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Generador de códigos de documento libre de carreras.
 *
 * Los `nextCode()` que había antes en QuotesService y ProductionsService leían
 * el último código con `orderBy: { code: 'desc' }`, le sumaban 1 y creaban la
 * fila fuera de esa lectura. Dos creaciones simultáneas calculaban el mismo
 * número y la segunda chocaba contra el índice único de `code`.
 *
 * Acá el incremento es una sola sentencia: Postgres serializa los concurrentes
 * sobre el row lock del contador y cada caller se lleva un número distinto.
 * Como el `scope` incluye el año, el reinicio anual es automático.
 */
@Injectable()
export class DocumentCodeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserva el siguiente número para `prefix` en el año dado y devuelve el
   * código formateado (`Q-2026-0001`).
   *
   * @param family  Familia del documento, para separar contadores (`QUOTE`, `PRODUCTION`).
   * @param prefix  Letra(s) del código (`Q`, `R`, `OP`).
   * @param pad     Dígitos del correlativo (default 4).
   */
  async next(
    family: string,
    prefix: string,
    year: number = new Date().getFullYear(),
    pad = 4,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const scope = `${family}:${prefix}:${year}`;
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<Array<{ value: number }>>`
      INSERT INTO "document_counters" ("scope", "value", "updatedAt")
      VALUES (${scope}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("scope") DO UPDATE
        SET "value" = "document_counters"."value" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "value"
    `;
    const value = rows[0]?.value ?? 1;
    return `${prefix}-${year}-${String(value).padStart(pad, '0')}`;
  }
}
