import type { WebAvailabilityValue } from '@tienda3d/shared';
import { z } from 'zod';
import type { PublicationMapping } from './catalog-mapping';
import { colorKey } from './store-colors';

/**
 * El catálogo de la web (`storefront/prisma/seed/catalog.json`) y cómo se
 * convierte en una publicación del sistema (plan F9·2). Lógica pura: la aplica
 * `StorefrontCatalogImporter`. El formato es copia de
 * `storefront/prisma/seed/schema.ts` (otro repo).
 */

const imageSchema = z.object({
  file: z.string().regex(/^[a-z0-9-]+\.webp$/),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const categorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  parentSlug: z.string().nullable(),
  description: z.string(),
  sortOrder: z.number().int(),
  image: imageSchema.nullable(),
});

const optionSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  values: z
    .array(
      z.object({
        slug: z.string().min(1),
        label: z.string().min(1),
        colorHex: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .nullable(),
      }),
    )
    .min(1),
});

const variantSchema = z.object({
  legacyWooId: z.number().int().nullable(),
  sku: z.string().nullable(),
  priceCents: z.number().int().nonnegative(),
  compareAtPriceCents: z.number().int().nonnegative().nullable(),
  trackStock: z.boolean(),
  stockQuantity: z.number().int(),
  allowBackorder: z.boolean(),
  maxPerOrder: z.number().int().positive().nullable(),
  options: z.record(z.string(), z.string()),
  imageFile: z.string().nullable(),
});

const productSchema = z.object({
  legacyWooId: z.number().int().nullable(),
  slug: z.string().min(1),
  name: z.string().min(1),
  summary: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
  categorySlugs: z.array(z.string()).min(1),
  weightGrams: z.number().int().positive().nullable(),
  dimensionsMm: z
    .object({
      length: z.number().int().positive(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable(),
  images: z.array(imageSchema).min(1),
  options: z.array(optionSchema),
  variants: z.array(variantSchema).min(1),
});

export const storefrontCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  source: z.string(),
  categories: z.array(categorySchema),
  products: z.array(productSchema),
});

export type StorefrontCatalog = z.infer<typeof storefrontCatalogSchema>;
export type StorefrontProduct = z.infer<typeof productSchema>;
export type StorefrontVariant = z.infer<typeof variantSchema>;
export type StorefrontCategory = z.infer<typeof categorySchema>;

/** Lo que el sistema tiene hoy, para armar el plan sin tocar la base. */
export interface PlanContext {
  /** Productos del sistema por SKU. */
  products: ReadonlyMap<string, SystemProductInfo>;
  /** Colores activos de la línea de filamento, por `colorKey`. */
  colors: ReadonlyMap<string, { id: string; color: string }>;
  /** Fotos que existen en `media/`. */
  files: ReadonlySet<string>;
}

export interface SystemProductInfo {
  id: string;
  name: string;
  isActive: boolean;
  /** Tiene Venta Directa habilitada: de ahí sale el precio web. */
  directSale: boolean;
  /** Slug de la publicación de la que ya es miembro, si hay. */
  publication: string | null;
}

export interface PlannedVariant {
  key: string;
  legacySku: string | null;
  availability: WebAvailabilityValue;
  stockQuantity: number;
  maxPerOrder: number | null;
  imageFile: string | null;
}

export interface PublicationPlan {
  slug: string;
  name: string;
  summary: string;
  description: string;
  /** Rótulo de la opción que eligen los miembros ("Tamaño"); solo con más de uno. */
  optionLabel: string | null;
  members: Array<{ productId: string; sku: string; valueLabel: string }>;
  colorOption: { label: string; colorIds: string[] } | null;
  attributes: Array<{ label: string; values: Array<{ label: string; slug: string }> }>;
  /** En el orden de la galería; `colorId` si la foto es de un solo color. */
  images: Array<{ file: string; alt: string; colorId: string | null }>;
  /** Vacío si no hay miembros: sin producto del sistema no hay variantes. */
  variants: PlannedVariant[];
  /** Variantes de la web que no se importan (no hay producto en el sistema). */
  skippedVariants: number;
  categorySlugs: string[];
  notes: string[];
}

export type PlanResult = { ok: true; plan: PublicationPlan } | { ok: false; errors: string[] };

/** Disponibilidad de la web en términos del sistema (D9). */
export function availabilityOf(v: StorefrontVariant): {
  availability: WebAvailabilityValue;
  stockQuantity: number;
} {
  if (!v.trackStock) return { availability: 'MADE_TO_ORDER', stockQuantity: 0 };
  return {
    availability: v.allowBackorder ? 'STOCK_THEN_ORDER' : 'STOCK_ONLY',
    stockQuantity: Math.max(0, v.stockQuantity),
  };
}

/**
 * Identifica una combinación igual en la web y en el sistema: miembro, color
 * (id del material) y valor de cada opción informativa (por rótulo y slug).
 */
export function variantKey(input: {
  member: string;
  colorId: string | null;
  attributes: Array<{ label: string; slug: string }>;
}): string {
  const attrs = input.attributes
    .map((a) => `${a.label.toLowerCase()}=${a.slug}`)
    .sort()
    .join(';');
  return `m=${input.member};c=${input.colorId ?? ''};${attrs}`;
}

/** La opción de color de la web es la que tiene código en todos sus valores. */
function isColorOption(option: StorefrontProduct['options'][number]): boolean {
  return option.values.every((v) => v.colorHex !== null);
}

export function planPublication(
  product: StorefrontProduct,
  mapping: PublicationMapping | undefined,
  categories: ReadonlyArray<Pick<StorefrontCategory, 'slug'>>,
  ctx: PlanContext,
): PlanResult {
  const errors: string[] = [];
  if (!mapping) {
    return { ok: false, errors: ['no está en la tabla de correspondencia (catalog-mapping.ts)'] };
  }
  const notes = mapping.note ? [mapping.note] : [];

  // Miembros: los productos del sistema, como los acepta el panel.
  const memberOption = mapping.memberOption
    ? product.options.find((o) => o.slug === mapping.memberOption)
    : undefined;
  if (mapping.memberOption && !memberOption) {
    errors.push(`la web no tiene la opción "${mapping.memberOption}" que elige el miembro`);
  }
  if (mapping.members.length > 1 && !mapping.memberOption) {
    errors.push('con más de un miembro hace falta memberOption');
  }
  const members: PublicationPlan['members'] = [];
  for (const m of mapping.members) {
    const system = ctx.products.get(m.sku);
    if (!system) {
      errors.push(`${m.sku} no existe en el sistema`);
      continue;
    }
    if (!system.isActive) errors.push(`${m.sku} "${system.name}" está archivado`);
    if (!system.directSale) {
      errors.push(`${m.sku} "${system.name}" no tiene Venta Directa habilitada`);
    }
    if (system.publication && system.publication !== product.slug) {
      errors.push(`${m.sku} "${system.name}" ya está en la publicación ${system.publication}`);
    }
    let valueLabel = '';
    if (memberOption) {
      const value = memberOption.values.find((v) => v.slug === m.value);
      if (!value) errors.push(`${memberOption.name} no tiene el valor "${m.value}" para ${m.sku}`);
      else valueLabel = value.label;
    }
    members.push({ productId: system.id, sku: m.sku, valueLabel });
  }
  if (memberOption) {
    const mapped = new Set(mapping.members.map((m) => m.value));
    for (const v of memberOption.values) {
      if (!mapped.has(v.slug)) errors.push(`${memberOption.name} "${v.label}" no tiene producto`);
    }
  }

  // Colores: solo los que existen en el sistema (D12).
  const colorOpt = product.options.find((o) => o !== memberOption && isColorOption(o));
  const colorIdBySlug = new Map<string, string>();
  if (colorOpt) {
    for (const v of colorOpt.values) {
      const found = ctx.colors.get(colorKey(v.label));
      if (found) colorIdBySlug.set(v.slug, found.id);
      else errors.push(`el color ${v.label} no está en la línea de filamento (store-colors.ts)`);
    }
  }

  // El resto son opciones informativas, sin precio (D6).
  const attributeOpts = product.options.filter((o) => o !== memberOption && o !== colorOpt);

  for (const slug of product.categorySlugs) {
    if (!categories.some((c) => c.slug === slug)) errors.push(`categoría ${slug} inexistente`);
  }
  for (const image of product.images) {
    if (!ctx.files.has(image.file)) errors.push(`falta la foto ${image.file}`);
  }

  const variants: PlannedVariant[] = [];
  const keys = new Set<string>();
  for (const v of product.variants) {
    const memberValue = memberOption ? v.options[memberOption.slug] : undefined;
    const member = memberOption
      ? (memberOption.values.find((x) => x.slug === memberValue)?.label ?? '')
      : '';
    const colorId = colorOpt ? (colorIdBySlug.get(v.options[colorOpt.slug] ?? '') ?? null) : null;
    const attributes = attributeOpts.map((o) => ({ label: o.name, slug: v.options[o.slug] ?? '' }));
    if (attributes.some((a) => !a.slug))
      errors.push(`una variante (${v.sku}) no elige todas las opciones`);
    if (v.imageFile && !product.images.some((i) => i.file === v.imageFile)) {
      errors.push(`la variante ${v.sku} usa una foto que no está en la galería`);
    }
    const key = variantKey({ member, colorId, attributes });
    if (keys.has(key)) errors.push(`dos variantes con la misma combinación (${v.sku})`);
    keys.add(key);
    variants.push({
      key,
      legacySku: v.sku,
      ...availabilityOf(v),
      maxPerOrder: v.maxPerOrder,
      imageFile: v.imageFile,
    });
  }

  // Una foto que solo usan variantes de un color se muestra al elegir ese color.
  const images = product.images.map((image) => {
    const colors = new Set(
      product.variants
        .filter((v) => v.imageFile === image.file && colorOpt)
        .map((v) => colorIdBySlug.get(v.options[colorOpt!.slug] ?? '')),
    );
    const [only] = colors;
    return { file: image.file, alt: image.alt, colorId: colors.size === 1 ? (only ?? null) : null };
  });

  if (errors.length) return { ok: false, errors };

  const hasMembers = members.length > 0;
  return {
    ok: true,
    plan: {
      slug: product.slug,
      name: product.name,
      summary: product.summary,
      description: product.description,
      optionLabel: memberOption ? memberOption.name : null,
      members,
      colorOption: colorOpt
        ? { label: colorOpt.name, colorIds: colorOpt.values.map((v) => colorIdBySlug.get(v.slug)!) }
        : null,
      attributes: attributeOpts.map((o) => ({
        label: o.name,
        values: o.values.map((v) => ({ label: v.label, slug: v.slug })),
      })),
      images,
      variants: hasMembers ? variants : [],
      skippedVariants: hasMembers ? 0 : variants.length,
      categorySlugs: product.categorySlugs,
      notes,
    },
  };
}
