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

/**
 * Valor de una opción informativa. Con `id` se renombra el valor existente;
 * sin `id`, se busca por `slug` (que sale de la etiqueta si no viene).
 */
export const webAttributeValueInputSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(60),
  slug: webSlugSchema.optional(),
});
export type WebAttributeValueInput = z.infer<typeof webAttributeValueInputSchema>;

/** Opción informativa sin producto del sistema detrás (D6): no cambia el precio. */
export const webAttributeInputSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(40),
  values: z.array(webAttributeValueInputSchema).min(1).max(30),
});
export type WebAttributeInput = z.infer<typeof webAttributeInputSchema>;

export const webAttributesSchema = z.object({
  attributes: z.array(webAttributeInputSchema).max(5),
});
export type WebAttributesInput = z.infer<typeof webAttributesSchema>;

/** Si una variante se puede comprar ahora (resultado de D9, no se guarda). */
export const webSaleStateSchema = z.enum(['IN_STOCK', 'MADE_TO_ORDER', 'OUT_OF_STOCK']);
export type WebSaleStateValue = z.infer<typeof webSaleStateSchema>;

/** Edición en línea de una variante desde el panel. */
export const webVariantUpdateSchema = z
  .object({
    isActive: z.boolean(),
    availability: webAvailabilitySchema,
    stockQuantity: z.number().int().min(0).max(100_000),
    maxPerOrder: z.number().int().min(1).max(999).nullable(),
    leadTimeDays: z.number().int().min(0).max(365).nullable(),
    imageId: z.string().min(1).nullable(),
  })
  .partial()
  .strict();
export type WebVariantUpdateInput = z.infer<typeof webVariantUpdateSchema>;

/**
 * Categorías de la vidriera (plan F5·6), aparte de las de precios del sistema:
 * dos niveles. La foto se sube aparte (F6).
 */
export const webCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: webSlugSchema.optional(),
  description: z.string().max(2000).optional(),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type WebCategoryCreateInput = z.infer<typeof webCategoryCreateSchema>;

export const webCategoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: webSlugSchema,
    description: z.string().max(2000),
    parentId: z.string().min(1).nullable(),
    sortOrder: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .partial()
  .strict();
export type WebCategoryUpdateInput = z.infer<typeof webCategoryUpdateSchema>;

export const webProductCategoriesSchema = z.object({
  categoryIds: z.array(z.string().min(1)).max(10),
});
export type WebProductCategoriesInput = z.infer<typeof webProductCategoriesSchema>;

/** Monto en pesos con hasta dos decimales (se guarda como Decimal(14,2)). */
const moneySchema = z
  .number()
  .min(0, 'El monto no puede ser negativo')
  .max(100_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Hasta dos decimales');

/**
 * Condiciones de venta de la tienda (plan F5·8): envío, retiro, transferencia
 * y el email que recibe los avisos de pedidos. Se guarda entero.
 */
export const ecommerceSettingsSchema = z
  .object({
    /** Envío con tarifa plana; null = no se ofrece envío. */
    shippingFlatRate: moneySchema.nullable(),
    /** Desde este total el envío es gratis; null = nunca. */
    freeShippingFrom: moneySchema.nullable(),
    pickupEnabled: z.boolean(),
    pickupInstructions: z.string().trim().max(2000),
    bankTransferEnabled: z.boolean(),
    bankTransferInstructions: z.string().trim().max(4000),
    notificationEmail: z.union([z.literal(''), z.string().trim().email('Email inválido').max(254)]),
  })
  .strict()
  .refine((s) => !s.bankTransferEnabled || s.bankTransferInstructions.length > 0, {
    path: ['bankTransferInstructions'],
    message: 'Con transferencia habilitada, cargá los datos para pagar (CBU o alias).',
  })
  .refine((s) => s.pickupEnabled || s.shippingFlatRate !== null, {
    path: ['pickupEnabled'],
    message: 'La tienda tiene que ofrecer retiro o envío.',
  });
export type EcommerceSettingsInput = z.infer<typeof ecommerceSettingsSchema>;

/** Datos editables de una foto de la galería (F6·2). El archivo no se reemplaza: se sube otra. */
export const webImageUpdateSchema = z
  .object({
    alt: z.string().trim().max(200),
    /** Lugar en la galería (0 = portada); las demás se corren. */
    position: z.number().int().min(0),
    /** Foto de un color: se muestra al elegirlo. Tiene que ser un color ofrecido. */
    colorMaterialId: z.string().min(1).nullable(),
  })
  .partial()
  .strict();
export type WebImageUpdateInput = z.infer<typeof webImageUpdateSchema>;
