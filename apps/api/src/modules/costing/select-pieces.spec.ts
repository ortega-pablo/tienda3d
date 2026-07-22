import { PieceScope } from '@prisma/client';
import { selectPieces } from './select-pieces';

/**
 * Tests unitarios del helper puro `selectPieces`. La orquestación con Prisma
 * (`CostingService.forProduct`) se cubre con QA manual (Fase A8) por la falta
 * de fixtures de Prisma en el repo.
 */
describe('selectPieces', () => {
  const pieces = [
    { scope: PieceScope.INDIVIDUAL, name: 'Ind A', grams: 5, printMinutes: 20 },
    { scope: PieceScope.INDIVIDUAL, name: 'Ind B', grams: 3, printMinutes: 12 },
    { scope: PieceScope.BATCH, name: 'Batch A', grams: 25, printMinutes: 100 },
    { scope: PieceScope.BATCH, name: 'Batch B', grams: 15, printMinutes: 60 },
  ];

  it('filtra INDIVIDUAL y no toca gramos/minutos sin divideBy', () => {
    const result = selectPieces(pieces, { scope: PieceScope.INDIVIDUAL });
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name)).toEqual(['Ind A', 'Ind B']);
    expect(result[0]!.grams).toBe(5);
    expect(result[0]!.printMinutes).toBe(20);
  });

  it('filtra BATCH y divide gramos y minutos por divideBy', () => {
    const result = selectPieces(pieces, { scope: PieceScope.BATCH, divideBy: 5 });
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('Batch A');
    expect(result[0]!.grams).toBe(5); // 25 / 5
    expect(result[0]!.printMinutes).toBe(20); // 100 / 5
    expect(result[1]!.grams).toBe(3); // 15 / 5
    expect(result[1]!.printMinutes).toBe(12); // 60 / 5
  });

  it('divideBy ausente, 0 o 1 no altera valores', () => {
    expect(selectPieces(pieces, { scope: PieceScope.BATCH })[0]!.grams).toBe(25);
    expect(selectPieces(pieces, { scope: PieceScope.BATCH, divideBy: 0 })[0]!.grams).toBe(25);
    expect(selectPieces(pieces, { scope: PieceScope.BATCH, divideBy: 1 })[0]!.grams).toBe(25);
  });

  it('sin scope devuelve todas las piezas', () => {
    expect(selectPieces(pieces)).toHaveLength(4);
  });

  it('no muta el array ni las piezas de entrada', () => {
    const snapshot = JSON.parse(JSON.stringify(pieces));
    selectPieces(pieces, { scope: PieceScope.BATCH, divideBy: 5 });
    expect(pieces).toEqual(snapshot);
  });

  it('equivalencia: BATCH ÷ 5 iguala la base individual cuando la placa es 5× la unidad', () => {
    // Una placa de 5 unidades cuyas piezas son exactamente 5× las individuales,
    // dividida por 5, produce los mismos gramos/minutos que las individuales.
    const individual = [{ scope: PieceScope.INDIVIDUAL, grams: 5, printMinutes: 20 }];
    const batch = [{ scope: PieceScope.BATCH, grams: 25, printMinutes: 100 }];
    const batchUnit = selectPieces(batch, { scope: PieceScope.BATCH, divideBy: 5 });
    expect(batchUnit[0]!.grams).toBe(individual[0]!.grams);
    expect(batchUnit[0]!.printMinutes).toBe(individual[0]!.printMinutes);
  });
});
