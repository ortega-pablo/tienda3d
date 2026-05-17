import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { CustomerEditor } from './customer-editor';
import { CustomerCommitments } from './customer-commitments';
import { CustomerMonthProgress } from './customer-month-progress';
import { CustomerSpecialProducts } from './customer-special-products';
import { CustomerPriceMatrix } from './customer-price-matrix';
import { CustomerHistory } from './customer-history';
import {
  TYPE_LABEL,
  type CategoryNode,
  type ChannelLite,
  type CustomerWithRelations,
  type ProductSummaryDto,
} from '../types';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('customer:read');
  const { id } = await params;

  let customer: CustomerWithRelations;
  try {
    customer = await api<CustomerWithRelations>(`/customers/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [channels, categories, products] = await Promise.all([
    api<ChannelLite[]>('/channels'),
    api<CategoryNode[]>('/categories'),
    api<ProductSummaryDto[]>('/products'),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{customer.name}</h1>
            <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              {TYPE_LABEL[customer.type]}
            </span>
            {!customer.isActive && (
              <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                Inactivo
              </span>
            )}
          </div>
          {customer.email && (
            <p className="text-muted-foreground">{customer.email}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/clientes/${customer.id}/catalogo`}>
              <BookOpen className="h-4 w-4" />
              Catálogo
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/clientes">Volver al listado</Link>
          </Button>
        </div>
      </header>

      <CustomerEditor mode="edit" customer={customer} />

      {customer.type === 'WHOLESALE' && (
        <>
          <CustomerCommitments customer={customer} categories={categories} />
          <CustomerMonthProgress customer={customer} />
        </>
      )}

      {customer.type === 'SPECIAL' && (
        <CustomerSpecialProducts customer={customer} products={products} />
      )}

      <CustomerPriceMatrix customer={customer} products={products} />

      <CustomerHistory customerId={customer.id} />
    </div>
  );
}
