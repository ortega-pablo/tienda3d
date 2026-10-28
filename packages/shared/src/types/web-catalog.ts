import type {
  WebAvailabilityValue,
  WebPriceStateValue,
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
  /** Precio publicado del producto del sistema (F7); null si todavía no se calculó. */
  priceState: WebPriceStateValue | null;
  price: number | null;
  /** Por qué no tiene precio y cómo resolverlo. */
  priceReason: string | null;
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

/** Foto de la galería, ya convertida a WebP. `path` es relativo al volumen `media`. */
export interface WebImageDto {
  id: string;
  path: string;
  alt: string;
  width: number;
  height: number;
  position: number;
  colorMaterialId: string | null;
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
  images: WebImageDto[];
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
  /** Qué falta y cómo resolverlo, cuando no alcanza con la etiqueta. */
  detail: string | null;
}

export interface WebPublishChecklistDto {
  ready: boolean;
  checks: WebPublishCheckDto[];
}

export interface EcommerceSettingsDto {
  shippingFlatRate: number | null;
  freeShippingFrom: number | null;
  pickupEnabled: boolean;
  pickupInstructions: string;
  bankTransferEnabled: boolean;
  bankTransferInstructions: string;
  notificationEmail: string;
  updatedAt: string | null;
}

export interface WebPriceHistoryEntryDto {
  changedAt: string;
  previous: number | null;
  price: number | null;
  /** Qué lo cambió: "Precio de insumo", "Markup de categoría", "Alta en la tienda"… */
  cause: string;
}

/** Precio publicado de un producto del sistema (Venta Directa, cliente normal, cantidad 1). */
export interface WebPriceDto {
  productId: string;
  state: WebPriceStateValue | null;
  price: number | null;
  /** Por qué no hay precio y cómo resolverlo. */
  reason: string | null;
  computedAt: string | null;
  /** Los últimos cambios, del más nuevo al más viejo. */
  history: WebPriceHistoryEntryDto[];
}

/** Lo que el listado de publicaciones marca (F7·4, F8·3). */
export type WebProductAlert = 'NO_PRICE' | 'INACTIVE_COLOR' | 'NO_IMAGES' | 'NO_VARIANTS';

/** La tienda vista desde la ficha de un producto del sistema (F8·2). */
export interface SystemProductWebDto {
  /** La publicación en la que está; null si todavía no se vende en la web. */
  publication: WebProductDto | null;
  checklist: WebPublishChecklistDto | null;
  price: WebPriceDto;
}

export interface WebProductSummaryDto {
  id: string;
  slug: string;
  name: string;
  status: WebProductStatusValue;
  memberCount: number;
  variantCount: number;
  activeVariantCount: number;
  /** Rango de los precios publicados de sus miembros con precio. */
  priceMin: number | null;
  priceMax: number | null;
  alerts: WebProductAlert[];
  /** Primera foto de la galería, relativa al volumen `media`. */
  coverImagePath: string | null;
  updatedAt: string;
}

/** Estado de los avisos al sitio, para la alerta del panel (F11·3). */
export interface OutboxStatusDto {
  /** Sin entregar todavía (se siguen reintentando). */
  pending: number;
  /** De esos, los que llevan más de 1 h. */
  stuck: number;
  /** Abandonados después de 48 h de reintentos. */
  failed: number;
  oldestPendingAt: string | null;
  lastError: string | null;
}
