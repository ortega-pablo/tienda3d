import { notFound } from 'next/navigation';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  ProductQuoteForm,
  type CustomerOption,
  type ProductLite,
  type ProductQuoteInitialState,
} from './product-quote-form';
import {
  buildProductInitialState,
  referencedProductIds,
  type QuoteForPrefill,
} from '../quote-prefill';

interface ChannelLite {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

export default async function NewProductQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requirePermission('quote:create');
  const canReadCustomers = user.permissions.includes('customer:read');
  const { from } = await searchParams;

  const [allProducts, channels, customers] = await Promise.all([
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

  let products = allProducts.filter((p) => p.isActive);
  let initialState: ProductQuoteInitialState | undefined;
  let prefillNotice: string[] | undefined;

  if (from) {
    const quote = await api<QuoteForPrefill>(`/quotes/${from}`).catch(() => null);
    if (quote && quote.type === 'PRODUCT') {
      initialState = buildProductInitialState(quote);
      // A3: incluir productos inactivos/eliminados referenciados por la
      // cotización original, para que el <select> pueda mostrarlos.
      const activeIds = new Set(products.map((p) => p.id));
      const notice: string[] = [];
      const extras: ProductLite[] = [];
      for (const id of referencedProductIds(quote)) {
        if (activeIds.has(id)) continue;
        const full = allProducts.find((p) => p.id === id);
        if (full) {
          extras.push({ ...full, name: `${full.name} (inactivo)` });
        } else {
          notice.push(
            'Un producto de la cotización original ya no existe. Revisá las líneas antes de guardar.',
          );
        }
      }
      if (extras.length > 0) {
        products = [...products, ...extras];
        notice.push('Algunos productos referenciados están inactivos (marcados "(inactivo)").');
      }
      if (notice.length > 0) prefillNotice = [...new Set(notice)];
    }
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
        products={products}
        customers={customers}
        ventaDirectaId={ventaDirecta.id}
        efectivoId={efectivo.id}
        initialState={initialState}
        prefillNotice={prefillNotice}
      />
    </div>
  );
}
