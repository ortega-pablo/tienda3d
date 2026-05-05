import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  ProductQuoteForm,
  type ProductLite,
  type ChannelLite,
} from './product-quote-form';

export default async function NewProductQuotePage() {
  await requirePermission('quote:create');
  const [products, channels] = await Promise.all([
    api<ProductLite[]>('/products'),
    api<ChannelLite[]>('/channels'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cotizar producto del catálogo</h1>
        <p className="text-muted-foreground">
          Selecciona uno o varios productos y la cantidad. El precio aplica la escala mayorista
          que corresponda al volumen.
        </p>
      </header>
      <ProductQuoteForm
        products={products.filter((p) => p.isActive)}
        channels={channels.filter((c) => c.isActive)}
      />
    </div>
  );
}
