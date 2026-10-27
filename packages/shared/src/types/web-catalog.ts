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
