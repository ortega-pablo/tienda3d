import type {
  WebAvailabilityValue,
  WebProductStatusValue,
  WebSaleStateValue,
} from '../schemas/web-catalog';

/** Producto del sistema que es variante (tamaño, modelo) de una publicación. */
export interface WebProductMemberDto {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  valueLabel: string;
  sortOrder: number;
  isActive: boolean;
}

/** Color de filamento que ofrece una opción. Si se desactiva en Insumos, deja de venderse. */
export interface WebColorValueDto {
  materialId: string;
  name: string;
  color: string | null;
  colorHex: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface WebColorOptionPieceDto {
  id: string;
  name: string;
  productId: string;
  productName: string;
}

export interface WebColorOptionDto {
  id: string;
  label: string;
  filamentLineId: string;
  filamentLineName: string;
  sortOrder: number;
  isActive: boolean;
  values: WebColorValueDto[];
  pieces: WebColorOptionPieceDto[];
}

export interface WebAttributeValueDto {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

/** Opción informativa ("Tipo de hoja"): genera variantes con el mismo precio (D6). */
export interface WebAttributeDto {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  values: WebAttributeValueDto[];
}

/** Un valor elegido de la combinación: un color o un valor de una opción informativa. */
export interface WebVariantOptionDto {
  kind: 'color' | 'attribute';
  /** Opción de color o atributo. */
  optionId: string;
  /** Material (color) o valor del atributo. */
  valueId: string;
  label: string;
  colorHex: string | null;
}

/** Combinación vendible, con su SKU `<SKU del producto>-VNN` (D15). */
export interface WebVariantDto {
  id: string;
  sku: string;
  memberId: string;
  memberLabel: string;
  isActive: boolean;
  /** La sacó de venta el admin: regenerar no la reactiva. */
  pausedByAdmin: boolean;
  availability: WebAvailabilityValue;
  stockQuantity: number;
  maxPerOrder: number | null;
  leadTimeDays: number | null;
  imageId: string | null;
  legacySku: string | null;
  options: WebVariantOptionDto[];
  /** Cómo se vende hoy (D9). */
  sale: { state: WebSaleStateValue; maxQuantity: number };
}

export interface WebVariantsRegenerateResultDto {
  created: number;
  kept: number;
  reactivated: number;
  paused: number;
  deactivated: number;
  product: WebProductDto;
}

/** Categoría de la vidriera; `parentId` null es de primer nivel. */
export interface WebCategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  parentId: string | null;
  imagePath: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  childCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebProductCategoryDto {
  id: string;
  slug: string;
  name: string;
}

export interface WebProductDto {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  seoTitle: string | null;
  seoDescription: string | null;
  optionLabel: string;
  status: WebProductStatusValue;
  publishedAt: string | null;
  featured: boolean;
  sortOrder: number;
  members: WebProductMemberDto[];
  colorOptions: WebColorOptionDto[];
  attributes: WebAttributeDto[];
  variants: WebVariantDto[];
  categories: WebProductCategoryDto[];
  /** Slugs anteriores, que el sitio redirige al actual. */
  previousSlugs: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lo que se revisa antes de publicar (F5·7). */
export type WebPublishCheckKey = 'slug' | 'description' | 'image' | 'variant';

export interface WebPublishCheckDto {
  key: WebPublishCheckKey;
  ok: boolean;
  label: string;
}

export interface WebPublishChecklistDto {
  ready: boolean;
  checks: WebPublishCheckDto[];
}

export interface WebProductSummaryDto {
  id: string;
  slug: string;
  name: string;
  status: WebProductStatusValue;
  memberCount: number;
  variantCount: number;
  updatedAt: string;
}
