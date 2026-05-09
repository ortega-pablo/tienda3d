export type CustomerType = 'STANDARD' | 'WHOLESALE' | 'CONSIGNMENT' | 'SPECIAL';

export interface CustomerLite {
  id: string;
  name: string;
  type: CustomerType;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  isActive: boolean;
  hasPortalAccess: boolean;
  defaultChannelId: string | null;
  skipChannelCommission: boolean;
  skipMarketing: boolean;
  skipRegime: boolean;
  skipReinvestment: boolean;
}

export interface CategoryCommitmentDto {
  id: string;
  customerId: string;
  categoryId: string;
  categoryName: string;
  categoryParentId: string | null;
  minTierQty: number | null;
  monthlyCommitmentQty: number | null;
  isWholesaleSuspended: boolean;
  suspensionReason: string | null;
  suspendedAt: string | null;
}

export interface CustomerProductOverrideDto {
  customerId: string;
  productId: string;
  productName: string;
  customMarkupPct: number | null;
  notes: string | null;
}

export interface CustomerWithRelations extends CustomerLite {
  categoryCommitments: CategoryCommitmentDto[];
  productOverrides: CustomerProductOverrideDto[];
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  children?: CategoryNode[];
}

export interface ChannelLite {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  kind: 'DIRECT_SALE' | 'CASH' | 'MARKETPLACE' | 'CUSTOM';
  isActive: boolean;
}

export interface ProductSummaryDto {
  id: string;
  name: string;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
}

export const TYPE_LABEL: Record<CustomerType, string> = {
  STANDARD: 'Estándar',
  WHOLESALE: 'Mayorista',
  CONSIGNMENT: 'Consignación',
  SPECIAL: 'Especial',
};

export const TYPE_DESCRIPTION: Record<CustomerType, string> = {
  STANDARD: 'Compra puntual (no se persiste en el sistema).',
  WHOLESALE: 'Compras recurrentes con piso de tier por categoría asociada.',
  CONSIGNMENT: 'Revende los productos. Sin comisión de canal ni marketing.',
  SPECIAL: 'Trato caso a caso con productos puntuales asignados.',
};
