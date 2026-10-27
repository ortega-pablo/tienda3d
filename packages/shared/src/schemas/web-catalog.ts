import { z } from 'zod';

/**
 * Contrato de la tienda online (plan de unificación, F5) — fuente única para la
 * API y el panel. Los enums son literales (este paquete no depende de
 * `@prisma/client`); la API verifica en compilación que coincidan con Prisma
 * (apps/api/src/modules/web-catalog/web-catalog.contract.ts).
 */

/** DRAFT → PUBLISHED ↔ HIDDEN: el botón de la ficha publica u oculta. */
export const webProductStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']);
export type WebProductStatusValue = z.infer<typeof webProductStatusSchema>;

/** Cómo se vende una variante (D9). */
export const webAvailabilitySchema = z.enum(['MADE_TO_ORDER', 'STOCK_ONLY', 'STOCK_THEN_ORDER']);
export type WebAvailabilityValue = z.infer<typeof webAvailabilitySchema>;

/** Si el precio publicado (Venta Directa, cliente normal, cantidad 1) se pudo calcular. */
export const webPriceStateSchema = z.enum(['OK', 'NO_PRICE']);
export type WebPriceStateValue = z.infer<typeof webPriceStateSchema>;
