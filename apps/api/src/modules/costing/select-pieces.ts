import { PieceScope } from '@prisma/client';

/**
 * Filtra y (opcionalmente) divide un conjunto de piezas impresas por scope.
 *
 * Usado por `CostingService.forProduct` para producir las dos bases de costo de
 * un producto tipo llavero:
 *   - base individual: `selectPieces(pieces, { scope: 'INDIVIDUAL' })`
 *   - base de tanda por unidad: `selectPieces(pieces, { scope: 'BATCH', divideBy: N })`
 *
 * Solo divide `grams` y `printMinutes` de cada pieza; nunca la cantidad de
 * piezas. Los insumos y adicionales NO pasan por acá (son por unidad).
 *
 * - `scope` ausente → no filtra (devuelve todas las piezas).
 * - `divideBy` ausente, ≤ 0 o 1 → no divide.
 * - No muta el array ni las piezas de entrada.
 */
export function selectPieces<
  T extends { scope: PieceScope; grams: number; printMinutes: number },
>(pieces: T[], opts: { scope?: PieceScope; divideBy?: number } = {}): T[] {
  const divideBy = opts.divideBy && opts.divideBy > 0 ? opts.divideBy : 1;
  const filtered = opts.scope ? pieces.filter((p) => p.scope === opts.scope) : pieces;
  if (divideBy === 1) return filtered;
  return filtered.map((p) => ({
    ...p,
    grams: p.grams / divideBy,
    printMinutes: p.printMinutes / divideBy,
  }));
}
