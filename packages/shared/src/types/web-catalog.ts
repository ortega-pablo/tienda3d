import type { WebProductStatusValue } from '../schemas/web-catalog';

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
  /** Slugs anteriores, que el sitio redirige al actual. */
  previousSlugs: string[];
  createdAt: string;
  updatedAt: string;
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
