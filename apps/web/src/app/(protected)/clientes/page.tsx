import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { CustomersList } from './customers-list';
import type { CustomerLite } from './types';

export default async function CustomersPage() {
  const user = await requirePermission('customer:read');
  const customers = await api<CustomerLite[]>('/customers');
  const canWrite = user.permissions.includes('customer:write');

  return <CustomersList customers={customers} canWrite={canWrite} />;
}
