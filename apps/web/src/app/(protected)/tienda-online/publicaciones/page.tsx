import type { WebProductSummaryDto } from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { PublicationsList } from './publications-list';

export default async function PublicacionesPage() {
  const user = await requirePermission('ecommerce:read');
  const publications = await api<WebProductSummaryDto[]>('/web-catalog/products');
  return (
    <PublicationsList
      publications={publications}
      canWrite={user.permissions.includes('ecommerce:write')}
    />
  );
}
