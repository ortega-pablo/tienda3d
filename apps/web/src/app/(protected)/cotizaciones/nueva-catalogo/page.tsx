import { notFound } from 'next/navigation';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  ProductQuoteForm,
  type CustomerOption,
  type ProductLite,
} from './product-quote-form';

interface ChannelLite {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

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

  // Las cotizaciones de catálogo SOLO operan contra VD o Efectivo
  // (decisión Fase 5). Resolvemos los ids por slug en server-side y los
  // pasamos al form; si alguno falta es un error de configuración del
  // seed → 404 informativo.
  const ventaDirecta = channels.find((c) => c.slug === 'directa' && c.isActive);
  const efectivo = channels.find((c) => c.slug === 'efectivo' && c.isActive);
  if (!ventaDirecta || !efectivo) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cotización de catálogo</h1>
        <p className="text-muted-foreground">
          Seleccioná uno o varios productos y la cantidad. El precio aplica las escalas de la
          categoría del producto — y los flags del cliente si elegís uno. Por default cotizás{' '}
          <strong>con factura</strong> (Venta Directa); tildá "Operación sin factura" para
          cambiar a Efectivo.
        </p>
      </header>
      <ProductQuoteForm
        products={products.filter((p) => p.isActive)}
        customers={customers}
        ventaDirectaId={ventaDirecta.id}
        efectivoId={efectivo.id}
      />
    </div>
  );
}
