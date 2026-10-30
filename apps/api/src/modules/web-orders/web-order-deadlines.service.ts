import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WebOrderFulfillment, WebOrderPayment } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OutboxService } from '@/modules/outbox/outbox.service';
import { PAYMENT_REMINDER_BEFORE_MS, UNPAID } from './domain/order-flow';
import { WebOrdersService } from './web-orders.service';

/**
 * Los pedidos sin pagar vencen solos (F22·4, D19): 24 h antes del vencimiento
 * de un pedido en efectivo o por transferencia, el sitio le avisa al cliente;
 * al vencer, se cancela y lo reservado vuelve al stock.
 */
@Injectable()
export class WebOrderDeadlinesService {
  private readonly logger = new Logger(WebOrderDeadlinesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly orders: WebOrdersService,
  ) {}

  @Cron('*/5 * * * *')
  async periodic(): Promise<void> {
    const now = new Date();
    const reminded = await this.remindDue(now);
    const expired = await this.expireDue(now);
    if (reminded || expired) {
      this.logger.log(`Pedidos sin pagar: ${reminded} avisados, ${expired} vencidos`);
    }
  }

  /** El aviso de "te quedan 24 h", una sola vez por plazo (efectivo y transferencia). */
  async remindDue(now: Date): Promise<number> {
    const due = await this.prisma.webOrder.findMany({
      where: {
        paymentStatus: { in: [WebOrderPayment.AWAITING_TRANSFER, WebOrderPayment.AWAITING_CASH] },
        fulfillmentStatus: WebOrderFulfillment.RECEIVED,
        paymentReminderAt: null,
        paymentDueAt: { gt: now, lte: new Date(now.getTime() + PAYMENT_REMINDER_BEFORE_MS) },
      },
      select: { id: true, externalId: true, code: true, paymentDueAt: true },
      take: 100,
    });
    let sent = 0;
    for (const order of due) {
      const claimed = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.webOrder.updateMany({
          where: { id: order.id, paymentReminderAt: null },
          data: { paymentReminderAt: now },
        });
        if (count === 0) return false;
        await this.outbox.enqueue(tx, 'order.payment_reminder', {
          externalId: order.externalId,
          code: order.code,
          paymentDueAt: order.paymentDueAt!.toISOString(),
        });
        return true;
      });
      if (claimed) sent++;
    }
    return sent;
  }

  /** Cancela lo que venció sin pagar. */
  async expireDue(now: Date): Promise<number> {
    const due = await this.prisma.webOrder.findMany({
      where: {
        paymentStatus: { in: UNPAID },
        fulfillmentStatus: WebOrderFulfillment.RECEIVED,
        paymentDueAt: { lte: now },
      },
      select: { id: true },
      take: 100,
    });
    let expired = 0;
    for (const { id } of due) if (await this.orders.expireIfDue(id, now)) expired++;
    return expired;
  }
}
