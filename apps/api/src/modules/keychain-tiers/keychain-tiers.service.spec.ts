import { KeychainTiersService } from './keychain-tiers.service';

/**
 * Tests unitarios del helper puro `divideForBatch` y de los métodos
 * estáticos del service. Los métodos que tocan la DB (list, findApplicable,
 * etc.) viven en `quotes.service` y se cubren con QA manual de Fase 5 del
 * plan (`docs/plans/keychain-batch-of-5.md`) por la falta de fixtures de
 * Prisma en el repo.
 */
describe('KeychainTiersService.divideForBatch', () => {
  const basePayload = {
    pieces: [
      { name: 'Pieza A', grams: 25, printMinutes: 100, filamentId: 'fil-1' },
      { name: 'Pieza B', grams: 10, printMinutes: 60, filamentId: 'fil-1' },
    ],
    materials: [
      { materialId: 'mat-1', quantity: 5 },
      { materialId: 'mat-2', quantity: 15 },
    ],
    assemblyMinutes: 20,
    managementMinutes: 10,
  };

  it('divide gramos, minutos y consumos por el batch size', () => {
    const result = KeychainTiersService.divideForBatch(basePayload, 5);

    expect(result.pieces).toHaveLength(2);
    expect(result.pieces[0]!.grams).toBe(5);
    expect(result.pieces[0]!.printMinutes).toBe(20);
    expect(result.pieces[1]!.grams).toBe(2);
    expect(result.pieces[1]!.printMinutes).toBe(12);

    expect(result.materials).toHaveLength(2);
    expect(result.materials[0]!.quantity).toBe(1);
    expect(result.materials[1]!.quantity).toBe(3);

    expect(result.assemblyMinutes).toBe(4);
    expect(result.managementMinutes).toBe(2);
  });

  it('mantiene los campos no qty-escalables intactos (nombres, ids)', () => {
    const result = KeychainTiersService.divideForBatch(basePayload, 5);
    expect(result.pieces[0]!).toMatchObject({
      name: 'Pieza A',
      filamentId: 'fil-1',
    });
    expect(result.materials[0]!.materialId).toBe('mat-1');
  });

  it('no muta el payload original (pure function)', () => {
    const snapshot = JSON.stringify(basePayload);
    KeychainTiersService.divideForBatch(basePayload, 5);
    expect(JSON.stringify(basePayload)).toBe(snapshot);
  });

  it('con batchSize=1 devuelve el payload sin tocar (fast path)', () => {
    const result = KeychainTiersService.divideForBatch(basePayload, 1);
    expect(result).toBe(basePayload); // misma referencia
  });

  it('con batchSize=0 o negativo trata como 1 (fast path defensivo)', () => {
    const r0 = KeychainTiersService.divideForBatch(basePayload, 0);
    expect(r0).toBe(basePayload);
    const rNeg = KeychainTiersService.divideForBatch(basePayload, -5);
    expect(rNeg).toBe(basePayload);
  });

  it('produce decimales correctos cuando la división no es exacta', () => {
    const payload = {
      pieces: [{ name: 'P', grams: 23, printMinutes: 100, filamentId: 'fil' }],
      materials: [{ materialId: 'm', quantity: 7 }],
      assemblyMinutes: 11,
      managementMinutes: 3,
    };
    const result = KeychainTiersService.divideForBatch(payload, 5);
    expect(result.pieces[0]!.grams).toBeCloseTo(4.6, 10);
    expect(result.pieces[0]!.printMinutes).toBe(20);
    expect(result.materials[0]!.quantity).toBeCloseTo(1.4, 10);
    expect(result.assemblyMinutes).toBeCloseTo(2.2, 10);
    expect(result.managementMinutes).toBeCloseTo(0.6, 10);
  });

  it('funciona con batch sizes alternativos (parametrización)', () => {
    const result = KeychainTiersService.divideForBatch(basePayload, 4);
    expect(result.pieces[0]!.grams).toBe(25 / 4);
    expect(result.assemblyMinutes).toBe(20 / 4);
  });

  it('payload con pieces o materials vacíos no rompe', () => {
    const emptyPayload = {
      pieces: [] as Array<{ name: string; grams: number; printMinutes: number; filamentId: string }>,
      materials: [] as Array<{ materialId: string; quantity: number }>,
      assemblyMinutes: 10,
      managementMinutes: 5,
    };
    const result = KeychainTiersService.divideForBatch(emptyPayload, 5);
    expect(result.pieces).toEqual([]);
    expect(result.materials).toEqual([]);
    expect(result.assemblyMinutes).toBe(2);
    expect(result.managementMinutes).toBe(1);
  });
});

describe('KeychainTiersService.tierLabel', () => {
  it('formatea tier acotado como "min-max"', () => {
    expect(KeychainTiersService.tierLabel({ minQty: 5, maxQty: 20 })).toBe('5-20');
  });

  it('formatea tier abierto como "min+"', () => {
    expect(KeychainTiersService.tierLabel({ minQty: 100, maxQty: null })).toBe('100+');
  });

  it('formatea tier de cantidad única como el número', () => {
    expect(KeychainTiersService.tierLabel({ minQty: 5, maxQty: 5 })).toBe('5');
  });
});
