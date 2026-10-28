import type { WebCategoryDto } from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { CategoriesManager } from './categories-manager';

export default async function CategoriasTiendaPage() {
  const user = await requirePermission('ecommerce:read');
  const categories = await api<WebCategoryDto[]>('/web-catalog/categories');
  return (
    <CategoriesManager
      initialCategories={categories}
      canWrite={user.permissions.includes('ecommerce:write')}
    />
  );
}
