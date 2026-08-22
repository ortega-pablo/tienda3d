import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductionStatus, StockMovementType } from '@prisma/client';
import { ProductionsService } from './productions.service';

/**
 * Tests de la transición de estado y del consumo de stock, con Prisma
 * mockeado. Cubren el contrato de F-02: el descuento y el cambio de estado
 * ocurren en UNA transacción y con un update condicional que cierra la carrera.
 */

type Mock = jest.Mock;

function makeService(opts: { claimedCount?: number } = {}) {
  const tx = {
    productionOrder: { updateMany: jest.fn().mockResolvedValue({ count: opts.claimedCount ?? 1 }) },
    material: { update: jest.fn().mockResolvedValue({}) },
    stockMovement: { create: jest.fn().mockResolvedValue({}) },
  };

  const order = {
    id: 'op-1',
    code: 'OP-2026-0001',
    productId: 'prod-1',
    quantity: 2,
    status: ProductionStatus.IN_PROGRESS,
    startedAt: new Date(),
    finishedAt: null,
    filamentOverrides: null,
  };

  const prisma = {
    productionOrder: {
      findUnique: jest.fn().mockResolvedValue(order),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'prod-1',
        name: 'Llavero',
        pieces: [],
        materials: [
          {
            materialId: 'mat-1',
            quantity: 3,
            material: { id: 'mat-1', name: 'Anilla', unit: 'UNIT', wastePct: 0 },
          },
        ],
      }),
    },
    material: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductionsService(
    prisma as never,
    { forProduct: jest.fn() } as never,
    audit as never,
    { next: jest.fn() } as never,
  );
  // `get()` re-lee la orden al final; no aporta a lo que se está probando.
  jest.spyOn(service, 'get').mockResolvedValue({} as never);
  return { service, prisma, tx, audit, order };
}

describe('ProductionsService.setStatus', () => {
  it('descuenta el stock DENTRO de la misma transacción que cambia el estado', async () => {
    const { service, prisma, tx } = makeService();

    await service.setStatus('op-1', ProductionStatus.DONE, 'user-1');

    // Una sola transacción para las dos cosas.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.productionOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.material.update).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);

    const movement = (tx.stockMovement.create as Mock).mock.calls[0]![0] as {
      data: { type: string; quantity: number };
    };
    expect(movement.data.type).toBe(StockMovementType.OUT);
    expect(movement.data.quantity).toBe(6); // 3 por unidad × 2 unidades, sin merma
  });

  it('el update es condicional sobre el estado leído', async () => {
    const { service, tx, order } = makeService();

    await service.setStatus('op-1', ProductionStatus.DONE, 'user-1');

    const call = (tx.productionOrder.updateMany as Mock).mock.calls[0]![0] as {
      where: { id: string; status: ProductionStatus };
    };
    expect(call.where).toEqual({ id: 'op-1', status: order.status });
  });

  it('si otro request ganó la carrera, responde 409 y NO descuenta stock', async () => {
    const { service, tx } = makeService({ claimedCount: 0 });

    await expect(service.setStatus('op-1', ProductionStatus.DONE, 'user-1')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.material.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('rechaza transiciones inválidas antes de tocar nada', async () => {
    const { service, prisma } = makeService();
    prisma.productionOrder.findUnique.mockResolvedValue({
      id: 'op-1',
      code: 'OP-2026-0001',
      productId: 'prod-1',
      quantity: 1,
      status: ProductionStatus.DONE, // terminal
      startedAt: new Date(),
      finishedAt: new Date(),
      filamentOverrides: null,
    });

    await expect(
      service.setStatus('op-1', ProductionStatus.IN_PROGRESS, 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un cambio de estado que no es DONE no toca el stock', async () => {
    const { service, tx, prisma } = makeService();
    prisma.productionOrder.findUnique.mockResolvedValue({
      id: 'op-1',
      code: 'OP-2026-0001',
      productId: 'prod-1',
      quantity: 2,
      status: ProductionStatus.PLANNED,
      startedAt: null,
      finishedAt: null,
      filamentOverrides: null,
    });

    await service.setStatus('op-1', ProductionStatus.IN_PROGRESS, 'user-1');

    expect(tx.productionOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.material.update).not.toHaveBeenCalled();
  });
});
