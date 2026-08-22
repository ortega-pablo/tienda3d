import { CustomerSuspensionReason, CustomerType } from '@prisma/client';
import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerCronService } from './customer-cron.service';
import { bootTestApp, seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * Cierre mensual contra Postgres real. Cubre F-09 (el desborde de día que hacía
 * cerrar el mes en curso) y la idempotencia que el servicio promete.
 */
describe('[int] Cierre mensual', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cron: CustomerCronService;
  let close: () => Promise<void>;
  let fx: Fixtures;
  let customerId: string;

  beforeAll(async () => {
    ({ moduleRef, prisma, close } = await bootTestApp());
    cron = moduleRef.get(CustomerCronService);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    fx = await seedFixtures(prisma);
    const customer = await prisma.customer.create({
      data: {
        name: 'Mayorista',
        type: CustomerType.WHOLESALE,
        categoryCommitments: {
          create: [{ categoryId: fx.categoryId, monthlyCommitmentQty: 10 }],
        },
      },
    });
    customerId = customer.id;
  });

  /**
   * F-09: addMonths hacía setUTCMonth() sobre la fecha original y desbordaba
   * cuando el día no existía en el mes destino. Correr el cierre manual un 31
   * cerraba el MES EN CURSO, suspendiendo clientes por un mes sin terminar.
   */
  it.each([
    ['2026-03-31T12:00:00Z', '2026-02-01'],
    ['2026-05-31T12:00:00Z', '2026-04-01'],
    ['2026-07-31T12:00:00Z', '2026-06-01'],
    ['2026-03-15T12:00:00Z', '2026-02-01'],
  ])('asOf=%s cierra %s', async (asOf, expected) => {
    const summary = await cron.runMonthlyClose(new Date(asOf));
    expect(summary.closedMonth.slice(0, 10)).toBe(expected);
  });

  it('suspende al cliente que no llegó al compromiso', async () => {
    const summary = await cron.runMonthlyClose(new Date('2026-03-15T12:00:00Z'));

    expect(summary.evaluatedCommitments).toBe(1);
    expect(summary.suspendedCommitments).toBe(1);

    const commitment = await prisma.customerCategoryCommitment.findFirstOrThrow({
      where: { customerId },
    });
    expect(commitment.isWholesaleSuspended).toBe(true);
    expect(commitment.suspensionReason).toBe(
      CustomerSuspensionReason.MONTHLY_COMMITMENT_MISSED,
    );
  });

  it('NO suspende al cliente que sí llegó', async () => {
    await prisma.customerMonthlyVolume.create({
      data: {
        customerId,
        categoryId: fx.categoryId,
        monthStart: new Date(Date.UTC(2026, 1, 1)),
        unitsSold: 12,
        committedQty: 10,
      },
    });

    const summary = await cron.runMonthlyClose(new Date('2026-03-15T12:00:00Z'));
    expect(summary.suspendedCommitments).toBe(0);

    const commitment = await prisma.customerCategoryCommitment.findFirstOrThrow({
      where: { customerId },
    });
    expect(commitment.isWholesaleSuspended).toBe(false);
  });

  it('es idempotente: correrlo dos veces no duplica nada', async () => {
    const first = await cron.runMonthlyClose(new Date('2026-03-15T12:00:00Z'));
    const second = await cron.runMonthlyClose(new Date('2026-03-15T12:00:00Z'));

    expect(first.suspendedCommitments).toBe(1);
    expect(second.suspendedCommitments).toBe(0); // ya estaba suspendido
    expect(second.newVolumesCreated).toBe(0); // la fila del mes nuevo ya existe

    const volumes = await prisma.customerMonthlyVolume.findMany({ where: { customerId } });
    // Una fila por mes: el cerrado (con unfulfilled) y el nuevo.
    expect(volumes).toHaveLength(2);

    const audits = await prisma.auditLog.count({
      where: { entity: 'CustomerCategoryCommitment', action: 'auto-suspend' },
    });
    expect(audits).toBe(1); // no genera doble audit
  });
});
