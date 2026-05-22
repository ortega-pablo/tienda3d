import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { CatalogView, type Catalog } from './catalog-view';

export default async function CustomerCatalogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('customer:read');
  const { id } = await params;

  let catalog: Catalog;
  try {
    catalog = await api<Catalog>(`/customers/${id}/catalog`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <CatalogView catalog={catalog} />;
}
