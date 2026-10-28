import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { signEvent } from '@/common/integration-auth/event-signature';
import { PrismaService } from '@/common/prisma/prisma.service';

/** Adónde y con qué secreto se entregan los avisos. Sin secreto, quedan pendientes. */
export interface OutboxTarget {
  url: string;
  secret: string | undefined;
}
export const OUTBOX_TARGET = Symbol('OUTBOX_TARGET');

/** Reintentos: de 30 s a 1 h, duplicando, durante 48 h (§5.5). */
export const RETRY_FIRST_MS = 30_000;
export const RETRY_MAX_MS = 60 * 60 * 1000;
export const GIVE_UP_AFTER_MS = 48 * 60 * 60 * 1000;
const BATCH = 50;
const TIMEOUT_MS = 10_000;

export function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_FIRST_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

/**
 * Entrega los avisos pendientes al sitio (plan F11·3), firmados (F11·2): cada
 * 15 s, en orden, con backoff y el último error guardado. El sitio deduplica por
 * `X-TP-Event-Id`, así que reintentar no duplica efectos.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private running = false;
  private warnedNoSecret = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OUTBOX_TARGET) private readonly target: OutboxTarget,
  ) {}

  @Interval('outbox-dispatch', 15_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchDue();
    } catch (error) {
      this.logger.error({ err: error }, 'Falló el despacho de avisos al sitio');
    } finally {
      this.running = false;
    }
  }

  async dispatchDue(
    now = new Date(),
  ): Promise<{ delivered: number; retried: number; failed: number }> {
    const result = { delivered: 0, retried: 0, failed: 0 };
    if (!this.target.secret) {
      if (!this.warnedNoSecret) {
        this.logger.warn('Sin EVENTS_SECRET_T3D_TO_SF: los avisos al sitio quedan pendientes.');
        this.warnedNoSecret = true;
      }
      return result;
    }

    const due = await this.prisma.outboxEvent.findMany({
      where: { deliveredAt: null, failedAt: null, nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    for (const event of due) {
      const error = await this.send(event.id, event.type, event.payload, now);
      if (!error) {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { deliveredAt: new Date(), attempts: { increment: 1 }, lastError: null },
        });
        result.delivered++;
        continue;
      }
      const attempts = event.attempts + 1;
      const givesUp = now.getTime() - event.createdAt.getTime() >= GIVE_UP_AFTER_MS;
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          lastError: error.slice(0, 500),
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
          ...(givesUp ? { failedAt: now } : {}),
        },
      });
      if (givesUp) result.failed++;
      else result.retried++;
    }
    if (result.retried || result.failed) {
      this.logger.warn(
        `Avisos al sitio: ${result.delivered} entregados, ${result.retried} a reintentar, ${result.failed} abandonados`,
      );
    }
    return result;
  }

  /** Manda un aviso; devuelve el error o null si el sitio lo aceptó (2xx). */
  private async send(
    id: string,
    type: string,
    payload: unknown,
    now: Date,
  ): Promise<string | null> {
    const body = JSON.stringify({ event: type, ...(payload as object) });
    const timestamp = Math.floor(now.getTime() / 1000);
    try {
      const res = await fetch(this.target.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tp-event-id': id,
          'x-tp-timestamp': String(timestamp),
          'x-tp-signature': signEvent(this.target.secret!, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.ok ? null : `HTTP ${res.status}`;
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      return cause ?? (error instanceof Error ? error.message : String(error));
    }
  }
}
