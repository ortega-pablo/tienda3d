import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerSuspensionReason } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface MonthlyCloseSummary {
  /** Mes que se cerró (primer día UTC). */
  closedMonth: string;
  /** Mes nuevo que arranca. */
  newMonth: string;
  /** Cantidad de commitments evaluados (con monthlyCommitmentQty != null). */
  evaluatedCommitments: number;
  /** Commitments suspendidos por incumplimiento. */
  suspendedCommitments: number;
  /** Volúmenes nuevos creados (uno por commitment activo). */
  newVolumesCreated: number;
  /** Detalle de cada acción (para reporte / debug). */
  actions: Array<{
    customerId: string;
    customerName: string;
    categoryId: string;
    categoryName: string;
    unitsSold: number;
    committedQty: number;
    fulfilled: boolean;
    suspended: boolean;
  }>;
}

/**
 * Cron mensual: cierra el mes anterior y arranca el nuevo.
 *
 * Para cada CustomerCategoryCommitment con monthlyCommitmentQty:
 *   1. Lee el CustomerMonthlyVolume del mes recién cerrado.
 *   2. Si el cliente no llegó al compromiso:
 *      - Marca el row como unfulfilled.
 *      - Suspende el commitment (MONTHLY_COMMITMENT_MISSED).
 *      - Genera audit log.
 *   3. Crea (si no existe) el row del nuevo mes con unitsSold=0 y
 *      committedQty=monthlyCommitmentQty.
 *
 * Idempotente: correrlo dos veces sobre el mismo mes no cambia el resultado
 * (las suspensiones ya hechas no se recrean, los rows nuevos se omiten si
 * ya existen vía unique constraint).
 */
@Injectable()
export class CustomerCronService {
  private readonly logger = new Logger(CustomerCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Cron del día 1 de cada mes a las 03:00 ART.
   * Si tu zona horaria del server difiere, configurar TZ via env.
   */
  @Cron('0 3 1 * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async runScheduled(): Promise<void> {
    this.logger.log('Iniciando cierre mensual programado');
    try {
      const summary = await this.runMonthlyClose(new Date());
      this.logger.log(
        `Cierre mensual completo: ${summary.suspendedCommitments} suspensiones, ${summary.newVolumesCreated} volúmenes nuevos`,
      );
    } catch (err) {
      this.logger.error('Falló el cierre mensual programado', err as Error);
    }
  }

  /**
   * Ejecuta el cierre tomando como "now" el `referenceDate` provisto.
   * Cierra el mes anterior al de la fecha y crea los volúmenes del actual.
   */
  async runMonthlyClose(referenceDate: Date): Promise<MonthlyCloseSummary> {
    const closedMonth = startOfMonthUtc(addMonths(referenceDate, -1));
    const newMonth = startOfMonthUtc(referenceDate);

    const commitments = await this.prisma.customerCategoryCommitment.findMany({
      where: {
        customer: { isActive: true },
        monthlyCommitmentQty: { not: null },
      },
      include: {
        customer: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    const summary: MonthlyCloseSummary = {
      closedMonth: closedMonth.toISOString(),
      newMonth: newMonth.toISOString(),
      evaluatedCommitments: commitments.length,
      suspendedCommitments: 0,
      newVolumesCreated: 0,
      actions: [],
    };

    for (const commitment of commitments) {
      const committedQty = commitment.monthlyCommitmentQty!;
      const closedVolume = await this.prisma.customerMonthlyVolume.findUnique({
        where: {
          customerId_categoryId_monthStart: {
            customerId: commitment.customerId,
            categoryId: commitment.categoryId,
            monthStart: closedMonth,
          },
        },
      });
      const unitsSold = closedVolume ? Number(closedVolume.unitsSold) : 0;
      const fulfilled = unitsSold >= committedQty;

      // Si NO llegó: suspender (idempotente: si ya estaba suspendido, no
      // genera doble audit).
      let suspended = false;
      if (!fulfilled) {
        if (closedVolume) {
          await this.prisma.customerMonthlyVolume.update({
            where: { id: closedVolume.id },
            data: { unfulfilled: true, committedQty },
          });
        } else {
          // Si no había row en absoluto, lo creamos vacío con unfulfilled=true
          // para que quede el registro histórico.
          await this.prisma.customerMonthlyVolume.create({
            data: {
              customerId: commitment.customerId,
              categoryId: commitment.categoryId,
              monthStart: closedMonth,
              unitsSold: 0,
              committedQty,
              unfulfilled: true,
            },
          });
        }

        if (!commitment.isWholesaleSuspended) {
          await this.prisma.customerCategoryCommitment.update({
            where: { id: commitment.id },
            data: {
              isWholesaleSuspended: true,
              suspensionReason: CustomerSuspensionReason.MONTHLY_COMMITMENT_MISSED,
              suspendedAt: new Date(),
            },
          });
          await this.audit.record({
            actorId: null, // sistema
            entity: 'CustomerCategoryCommitment',
            entityId: commitment.id,
            action: 'auto-suspend',
            before: { isWholesaleSuspended: false },
            after: {
              isWholesaleSuspended: true,
              suspensionReason: 'MONTHLY_COMMITMENT_MISSED',
              unitsSold,
              committedQty,
              monthStart: closedMonth.toISOString(),
            },
          });
          summary.suspendedCommitments += 1;
          suspended = true;
        }
      }

      // Crear el row del nuevo mes (si no existe ya).
      try {
        await this.prisma.customerMonthlyVolume.create({
          data: {
            customerId: commitment.customerId,
            categoryId: commitment.categoryId,
            monthStart: newMonth,
            unitsSold: 0,
            committedQty,
            unfulfilled: false,
          },
        });
        summary.newVolumesCreated += 1;
      } catch {
        // Unique constraint: ya existe. OK.
      }

      summary.actions.push({
        customerId: commitment.customerId,
        customerName: commitment.customer.name,
        categoryId: commitment.categoryId,
        categoryName: commitment.category.name,
        unitsSold,
        committedQty,
        fulfilled,
        suspended,
      });
    }

    return summary;
  }
}

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
