import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OutboxStatusDto } from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';

/** Un aviso pendiente hace más de esto se muestra como alerta en el panel. */
export const OUTBOX_ALERT_AFTER_MS = 60 * 60 * 1000;

/**
 * Avisos del sistema al sitio (plan F11·3). `enqueue` va dentro de la
 * transacción del cambio: si el cambio no se confirma, el aviso tampoco existe.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    tx: Prisma.TransactionClient,
    type: string,
    payload: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.outboxEvent.create({ data: { type, payload } });
  }

  /** Para la alerta del panel: qué está atrasado y por qué. */
  async status(now = new Date()): Promise<OutboxStatusDto> {
    const pending = { deliveredAt: null, failedAt: null };
    const stuckSince = new Date(now.getTime() - OUTBOX_ALERT_AFTER_MS);
    const [pendingCount, stuck, failed, oldest, lastFailure] = await Promise.all([
      this.prisma.outboxEvent.count({ where: pending }),
      this.prisma.outboxEvent.count({ where: { ...pending, createdAt: { lt: stuckSince } } }),
      this.prisma.outboxEvent.count({ where: { failedAt: { not: null } } }),
      this.prisma.outboxEvent.findFirst({
        where: pending,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.outboxEvent.findFirst({
        where: { deliveredAt: null, lastError: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { lastError: true },
      }),
    ]);
    return {
      pending: pendingCount,
      stuck,
      failed,
      oldestPendingAt: oldest?.createdAt.toISOString() ?? null,
      lastError: lastFailure?.lastError ?? null,
    };
  }
}
