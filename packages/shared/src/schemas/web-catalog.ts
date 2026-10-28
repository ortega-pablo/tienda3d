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

/** Slug de una URL de la tienda: minúsculas, números y guiones. */
export const webSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Solo minúsculas, números y guiones (sin espacios ni tildes)',
  );

export const webProductMemberInputSchema = z.object({
  productId: z.string().min(1),
  /** "280", "390"; vacío si la publicación tiene un solo miembro. */
  valueLabel: z.string().trim().max(40).default(''),
  sortOrder: z.number().int().min(0).optional(),
});
export type WebProductMemberInput = z.infer<typeof webProductMemberInputSchema>;

export const webProductCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: webSlugSchema.optional(),
  summary: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  optionLabel: z.string().trim().min(1).max(40).optional(),
  members: z.array(webProductMemberInputSchema).max(20).optional(),
});
export type WebProductCreateInput = z.infer<typeof webProductCreateSchema>;

export const webProductUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug: webSlugSchema,
    summary: z.string().max(500),
    description: z.string().max(10000),
    seoTitle: z.string().trim().max(70).nullable(),
    seoDescription: z.string().trim().max(160).nullable(),
    optionLabel: z.string().trim().min(1).max(40),
    featured: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .partial()
  .strict();
export type WebProductUpdateInput = z.infer<typeof webProductUpdateSchema>;

export const webProductMembersSchema = z.object({
  members: z.array(webProductMemberInputSchema).min(1).max(20),
});
export type WebProductMembersInput = z.infer<typeof webProductMembersSchema>;

/**
 * Opción de color de una publicación (T8): los colores elegidos de una línea de
 * filamento y las piezas que pintan. Con `id` se actualiza la opción existente;
 * sin `id`, se crea. Sin `pieceIds`, toma las piezas de los miembros que usan la línea.
 */
export const webColorOptionInputSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(40).default('Color'),
  filamentLineId: z.string().min(1),
  /** Colores (hijos activos de la línea) en el orden en que se muestran. */
  colorIds: z.array(z.string().min(1)).min(1).max(30),
  pieceIds: z.array(z.string().min(1)).min(1).max(50).optional(),
});
export type WebColorOptionInput = z.infer<typeof webColorOptionInputSchema>;

export const webColorOptionsSchema = z.object({
  options: z.array(webColorOptionInputSchema).max(5),
});
export type WebColorOptionsInput = z.infer<typeof webColorOptionsSchema>;
