import { notFound } from 'next/navigation';
import type {
  WebCategoryDto,
  WebPriceDto,
  WebProductDto,
  WebPublishChecklistDto,
} from '@tienda3d/shared';
import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  PublicationEditor,
  type FilamentLine,
  type MemberPieces,
  type SystemProduct,
} from './publication-editor';

/** Dirección pública de la tienda, para el link "Ver en la tienda". */
const STORE_URL = process.env.STORE_PUBLIC_URL ?? 'http://tienda.localhost';

export default async function PublicacionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('ecommerce:read');
  const { id } = await params;

  let product: WebProductDto;
  try {
    product = await api<WebProductDto>(`/web-catalog/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const memberIds = [...new Set(product.members.map((m) => m.productId))];
  const [systemProducts, lines, categories, checklist, prices, pieces] = await Promise.all([
    api<SystemProduct[]>('/products'),
    api<FilamentLine[]>('/materials?type=FILAMENT&activeOnly=false'),
    api<WebCategoryDto[]>('/web-catalog/categories'),
    api<WebPublishChecklistDto>(`/web-catalog/products/${id}/checklist`),
    Promise.all(memberIds.map((pid) => api<WebPriceDto>(`/web-catalog/prices/${pid}/history`))),
    Promise.all(memberIds.map((pid) => api<MemberPieces>(`/products/${pid}`))),
  ]);

  return (
    <PublicationEditor
      initialProduct={product}
      initialChecklist={checklist}
      prices={prices}
      memberPieces={pieces}
      systemProducts={systemProducts.filter((p) => p.isActive)}
      lines={lines.filter((l) => l.parentId === null)}
      categories={categories}
      storeUrl={STORE_URL}
      canWrite={user.permissions.includes('ecommerce:write')}
    />
  );
}
