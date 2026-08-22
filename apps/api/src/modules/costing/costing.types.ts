/**
 * Tipos del motor de costeo. La definición vive en `@tienda3d/shared`: son
 * formas de datos puras (sin Prisma ni NestJS) que el frontend también consume
 * para pintar el desglose de una cotización. Antes web re-declaraba un subset a
 * mano y podía separarse sin que nada lo detectara.
 *
 * Re-export explícito (no `export *`) para no arrastrar el barrel entero.
 */
export type {
  CostingInput,
  CostingResult,
  MaterialCostBreakdown,
  MaterialCostInput,
  PieceCostBreakdown,
  PieceCostInput,
} from '@tienda3d/shared';
