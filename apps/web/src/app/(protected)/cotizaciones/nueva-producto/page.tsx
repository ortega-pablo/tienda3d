import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  ProductQuoteForm,
  type CustomerOption,
  type ProductLite,
  type ChannelLite,
} from './product-quote-form';

export default async function NewProductQuotePage() {
  const user = await requirePermission('quote:create');
  const canReadCustomers = user.permissions.includes('customer:read');

  const [products, channels, customers] = await Promise.all([
    api<ProductLite[]>('/products'),
    api<ChannelLite[]>('/channels'),
    canReadCustomers
      ? api<CustomerOption[]>('/customers?activeOnly=true')
      : Promise.resolve([] as CustomerOption[]),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cotizar producto del catálogo</h1>
        <p className="text-muted-foreground">
          Seleccioná uno o varios productos y la cantidad. El precio aplica la escala mayorista
          que corresponda al volumen — y los flags del cliente si elegís uno.
        </p>
      </header>
      <ProductQuoteForm
        products={products.filter((p) => p.isActive)}
        channels={channels.filter((c) => c.isActive)}
        customers={customers}
      />
    </div>
  );
}
