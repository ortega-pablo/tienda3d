import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface AuditLogDto {
  id: string;
  actorId: string | null;
  actorName: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  at: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort audit recorder. Failures here must NOT break the calling
   * operation, so all errors are logged and swallowed.
   */
  async record(input: {
    actorId: string | null;
    entity: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          entity: input.entity,
          entityId: input.entityId,
          action: input.action,
          before: this.toJson(input.before),
          after: this.toJson(input.after),
        },
      });
    } catch (err) {
      this.logger.warn({ err }, 'Audit record failed');
    }
  }

  async list(filters: {
    entity?: string;
    actorId?: string;
    limit?: number;
  }): Promise<AuditLogDto[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(filters.entity && { entity: filters.entity }),
        ...(filters.actorId && { actorId: filters.actorId }),
      },
      orderBy: { at: 'desc' },
      take: filters.limit ?? 100,
      include: { actor: { select: { name: true } } },
    });
    return logs.map((l) => ({
      id: l.id,
      actorId: l.actorId,
      actorName: l.actor?.name ?? null,
      entity: l.entity,
      entityId: l.entityId,
      action: l.action,
      before: l.before,
      after: l.after,
      at: l.at,
    }));
  }

  private toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }
}
