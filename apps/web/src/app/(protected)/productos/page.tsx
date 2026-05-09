import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { ProductsList, type CategoryNode, type ProductSummaryDto } from './products-list';

export default async function ProductsPage() {
  const user = await requirePermission('product:read');
  const [products, categories] = await Promise.all([
    api<ProductSummaryDto[]>('/products'),
    api<CategoryNode[]>('/categories'),
  ]);
  const canWrite = user.permissions.includes('product:write');

  return <ProductsList products={products} categories={categories} canWrite={canWrite} />;
}
