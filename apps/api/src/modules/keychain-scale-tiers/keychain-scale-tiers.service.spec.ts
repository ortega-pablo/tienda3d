import { PieceScope } from '@prisma/client';
import { KeychainScaleTiersService } from './keychain-scale-tiers.service';

/**
 * Tests unitarios de los helpers puros del service. Los métodos que tocan la DB
 * (list, updateMarkup) se cubren con QA manual (Fase A8) por la falta de
 * fixtures de Prisma en el repo.
 */
const GRID = [
  { minQty: 1, maxQty: 4, markupPct: 100 },
  { minQty: 5, maxQty: 24, markupPct: 80 },
  { minQty: 25, maxQty: 49, markupPct: 60 },
  { minQty: 50, maxQty: 99, markupPct: 50 },
  { minQty: 100, maxQty: null, markupPct: 35 },
];

describe('KeychainScaleTiersService.resolveApplicable', () => {
  const cases: Array<[number, number]> = [
    [1, 1],
    [4, 1],
    [5, 5],
    [24, 5],
    [25, 25],
    [49, 25],
    [50, 50],
    [99, 50],
    [100, 100],
    [9999, 100],
  ];
  it.each(cases)('qty=%i resuelve la escala con minQty=%i', (qty, expectedMin) => {
    expect(KeychainScaleTiersService.resolveApplicable(GRID, qty)?.minQty).toBe(expectedMin);
  });

  it('cubre todo entero ≥ 1 sin huecos (1..200)', () => {
    for (let qty = 1; qty <= 200; qty++) {
      expect(KeychainScaleTiersService.resolveApplicable(GRID, qty)).not.toBeNull();
    }
  });
});

describe('KeychainScaleTiersService.resolveScope', () => {
  it('1..4 usan base INDIVIDUAL', () => {
    for (const qty of [1, 2, 3, 4]) {
      expect(KeychainScaleTiersService.resolveScope(GRID, qty)).toBe(PieceScope.INDIVIDUAL);
    }
  });
  it('5 en adelante usan base BATCH', () => {
    for (const qty of [5, 24, 25, 100, 500]) {
      expect(KeychainScaleTiersService.resolveScope(GRID, qty)).toBe(PieceScope.BATCH);
    }
  });
});

describe('KeychainScaleTiersService.tierLabel', () => {
  it('formatea rangos, punto y abierto', () => {
    expect(KeychainScaleTiersService.tierLabel({ minQty: 5, maxQty: 24 })).toBe('5-24');
    expect(KeychainScaleTiersService.tierLabel({ minQty: 100, maxQty: null })).toBe('100+');
    expect(KeychainScaleTiersService.tierLabel({ minQty: 3, maxQty: 3 })).toBe('3');
  });
});

describe('KeychainScaleTiersService.assertValidGrid', () => {
  it('acepta la grilla seedeada', () => {
    expect(() => KeychainScaleTiersService.assertValidGrid(GRID)).not.toThrow();
  });
  it('rechaza grilla vacía', () => {
    expect(() => KeychainScaleTiersService.assertValidGrid([])).toThrow();
  });
  it('rechaza primera fila con minQty ≠ 1', () => {
    expect(() =>
      KeychainScaleTiersService.assertValidGrid([{ minQty: 2, maxQty: null, markupPct: 100 }]),
    ).toThrow();
  });
  it('rechaza hueco entre filas', () => {
    expect(() =>
      KeychainScaleTiersService.assertValidGrid([
        { minQty: 1, maxQty: 4, markupPct: 100 },
        { minQty: 6, maxQty: null, markupPct: 80 }, // hueco: falta 5
      ]),
    ).toThrow();
  });
  it('rechaza dos filas abiertas', () => {
    expect(() =>
      KeychainScaleTiersService.assertValidGrid([
        { minQty: 1, maxQty: null, markupPct: 100 },
        { minQty: 5, maxQty: null, markupPct: 80 },
      ]),
    ).toThrow();
  });
  it('rechaza markups crecientes', () => {
    expect(() =>
      KeychainScaleTiersService.assertValidGrid([
        { minQty: 1, maxQty: 4, markupPct: 50 },
        { minQty: 5, maxQty: null, markupPct: 80 }, // sube en vez de bajar
      ]),
    ).toThrow();
  });
});
