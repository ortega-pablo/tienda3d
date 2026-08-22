import { notFound } from 'next/navigation';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  RapidQuoteForm,
  type CustomerOption,
  type RapidQuoteInitialState,
} from './rapid-quote-form';
import {
  buildAdhocOptionLists,
  buildRapidInitialState,
  referencedMaterialIds,
  type MaterialFull,
  type QuoteForPrefill,
} from '../quote-prefill';

interface ChannelLite {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

export default async function NewRapidQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requirePermission('quote:create');
  const canReadCustomers = user.permissions.includes('customer:read');
  const { from } = await searchParams;

  const [channels, materials, customers] = await Promise.all([
    api<ChannelLite[]>('/channels'),
    api<MaterialFull[]>('/materials'),
    canReadCustomers
      ? api<CustomerOption[]>('/customers?activeOnly=true')
      : Promise.resolve([] as CustomerOption[]),
  ]);

  const ventaDirecta = channels.find((c) => c.slug === 'directa' && c.isActive);
  const efectivo = channels.find((c) => c.slug === 'efectivo' && c.isActive);
  if (!ventaDirecta || !efectivo) {
    notFound();
  }

  let initialState: RapidQuoteInitialState | undefined;
  let ref: { filamentIds: string[]; materialIds: string[] } | null = null;

  if (from) {
    const quote = await api<QuoteForPrefill>(`/quotes/${from}`).catch(() => null);
    // Solo ADHOC libre (los llaveros usan /nueva-llaveros).
    if (quote && quote.type === 'ADHOC') {
      initialState = buildRapidInitialState(quote, false);
      ref = referencedMaterialIds(quote);
    }
  }

  const { filaments, nonFilaments, notice } = buildAdhocOptionLists(materials, ref);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cotización a medida</h1>
        <p className="text-muted-foreground">
          Para piezas personalizadas que no están en el catálogo. Cargás material, gramaje,
          tiempo de impresión y mano de obra de cada componente para obtener un precio. Por
          default cotiza con factura (Venta Directa); tildá &ldquo;Operación sin factura&rdquo; para
          Efectivo.
        </p>
      </header>
      <RapidQuoteForm
        filaments={filaments}
        nonFilaments={nonFilaments}
        customers={customers}
        ventaDirectaId={ventaDirecta.id}
        efectivoId={efectivo.id}
        initialState={initialState}
        prefillNotice={notice.length > 0 ? notice : undefined}
      />
    </div>
  );
}
