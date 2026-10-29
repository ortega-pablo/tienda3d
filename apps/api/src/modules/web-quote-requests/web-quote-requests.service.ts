import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WebQuoteRequestStatus } from '@prisma/client';
import type {
  WebQuoteRequestDetailDto,
  WebQuoteRequestListQuery,
  WebQuoteRequestSummaryDto,
  WebQuoteRequestUpdateInput,
} from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { AuditService } from '@/modules/audit/audit.service';
import { OutboxService } from '@/modules/outbox/outbox.service';

const SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  idea: true,
  status: true,
  attachmentPath: true,
  requestedAt: true,
  quote: { select: { id: true, code: true } },
} satisfies Prisma.WebQuoteRequestSelect;

type SummaryRow = Prisma.WebQuoteRequestGetPayload<{ select: typeof SUMMARY_SELECT }>;

/**
 * Las solicitudes de personalización en el panel (plan F15·3): el admin las
 * mira, les cambia el estado, descarga el archivo y las convierte en una
 * cotización a medida, que queda vinculada. Cada cambio de estado le llega al
 * sitio por el outbox, que se lo muestra al cliente en Mi cuenta (F15·4).
 */
@Injectable()
export class WebQuoteRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(query: WebQuoteRequestListQuery): Promise<WebQuoteRequestSummaryDto[]> {
    const rows = await this.prisma.webQuoteRequest.findMany({
      where: query.status ? { status: query.status } : {},
      select: SUMMARY_SELECT,
      orderBy: { requestedAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.summary(r));
  }

  /** Para el contador del menú: las nuevas. */
  newCount(): Promise<number> {
    return this.prisma.webQuoteRequest.count({ where: { status: WebQuoteRequestStatus.NEW } });
  }

  async get(id: string): Promise<WebQuoteRequestDetailDto> {
    const r = await this.prisma.webQuoteRequest.findUnique({
      where: { id },
      select: {
        ...SUMMARY_SELECT,
        customerId: true,
        attachmentName: true,
        attachmentType: true,
        attachmentSize: true,
        adminNote: true,
      },
    });
    if (!r) throw new NotFoundException('Solicitud inexistente');
    return {
      ...this.summary(r),
      idea: r.idea,
      customerId: r.customerId,
      attachment: r.attachmentPath
        ? { name: r.attachmentName ?? 'archivo', type: r.attachmentType, size: r.attachmentSize }
        : null,
      adminNote: r.adminNote,
      quote: r.quote,
    };
  }

  async update(
    id: string,
    input: WebQuoteRequestUpdateInput,
    actorId: string,
  ): Promise<WebQuoteRequestDetailDto> {
    const found = await this.prisma.webQuoteRequest.findUnique({
      where: { id },
      select: { externalId: true, status: true, adminNote: true },
    });
    if (!found) throw new NotFoundException('Solicitud inexistente');
    const { externalId, ...before } = found;
    await this.prisma.$transaction(async (tx) => {
      await tx.webQuoteRequest.update({ where: { id }, data: input });
      if (input.status && input.status !== before.status) {
        await this.statusChanged(tx, externalId, input.status);
      }
    });
    await this.audit.record({
      actorId,
      entity: 'WebQuoteRequest',
      entityId: id,
      action: 'update',
      before,
      after: input,
    });
    return this.get(id);
  }

  /** El archivo, para descargarlo desde el panel. */
  async attachment(id: string): Promise<{ path: string; name: string; type: string }> {
    const r = await this.prisma.webQuoteRequest.findUnique({
      where: { id },
      select: { attachmentPath: true, attachmentName: true, attachmentType: true },
    });
    if (!r?.attachmentPath) throw new NotFoundException('La solicitud no tiene archivo');
    return {
      path: await this.storage.resolveExisting('private', r.attachmentPath),
      name: r.attachmentName ?? 'archivo',
      type: r.attachmentType || 'application/octet-stream',
    };
  }

  /** Antes de armar la cotización: que exista y que todavía no tenga una. */
  async assertQuotable(id: string): Promise<void> {
    const r = await this.prisma.webQuoteRequest.findUnique({
      where: { id },
      select: { quoteId: true },
    });
    if (!r) throw new NotFoundException('Solicitud inexistente');
    if (r.quoteId) throw new ConflictException('Esta solicitud ya tiene su cotización.');
  }

  /**
   * Vincula la cotización recién creada y deja la solicitud cotizada, en la
   * transacción que la crea: si otra cotización la ganó, no se crea esta.
   */
  async linkQuote(tx: Prisma.TransactionClient, id: string, quoteId: string): Promise<void> {
    const linked = await tx.webQuoteRequest.updateMany({
      where: { id, quoteId: null },
      data: { quoteId, status: WebQuoteRequestStatus.QUOTED },
    });
    if (linked.count === 0) throw new ConflictException('Esta solicitud ya tiene su cotización.');
    const { externalId } = await tx.webQuoteRequest.findUniqueOrThrow({
      where: { id },
      select: { externalId: true },
    });
    await this.statusChanged(tx, externalId, WebQuoteRequestStatus.QUOTED);
  }

  /** Aviso al sitio del estado nuevo (§5.5); `changedAt` ordena los avisos. */
  private statusChanged(
    tx: Prisma.TransactionClient,
    externalId: string,
    status: WebQuoteRequestStatus,
  ): Promise<void> {
    return this.outbox.enqueue(tx, 'quote_request.status_changed', {
      externalId,
      status,
      changedAt: new Date().toISOString(),
    });
  }

  private summary(r: SummaryRow): WebQuoteRequestSummaryDto {
    const idea = r.idea.replace(/\s+/g, ' ').trim();
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      ideaPreview: idea.length > 140 ? `${idea.slice(0, 139)}…` : idea,
      status: r.status,
      hasAttachment: r.attachmentPath !== null,
      requestedAt: r.requestedAt.toISOString(),
      quoteCode: r.quote?.code ?? null,
    };
  }
}
