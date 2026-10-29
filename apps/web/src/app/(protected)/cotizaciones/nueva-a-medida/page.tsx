import { notFound } from 'next/navigation';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import type { WebQuoteRequestDetailDto } from '@tienda3d/shared';
import {
  RapidQuoteForm,
  type CustomerOption,
  type QuoteFromRequest,
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
  searchParams: Promise<{ from?: string; solicitud?: string }>;
}) {
  const user = await requirePermission('quote:create');
  const canReadCustomers = user.permissions.includes('customer:read');
  const { from, solicitud } = await searchParams;

  // Desde una solicitud de personalización de la tienda (F15·3).
  let fromRequest: QuoteFromRequest | undefined;
  if (solicitud && user.permissions.includes('ecommerce:orders')) {
    const r = await api<WebQuoteRequestDetailDto>(
      `/web-quote-requests/${encodeURIComponent(solicitud)}`,
    ).catch(() => null);
    if (r && !r.quote) {
      fromRequest = {
        id: r.id,
        customerId: r.customerId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        idea: r.idea,
      };
    }
  }

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
          Para piezas personalizadas que no están en el catálogo. Cargás material, gramaje, tiempo
          de impresión y mano de obra de cada componente para obtener un precio. Por default cotiza
          con factura (Venta Directa); tildá &ldquo;Operación sin factura&rdquo; para Efectivo.
        </p>
        {fromRequest && (
          <div className="mt-3 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p>
              Cotizando la solicitud de personalización de <strong>{fromRequest.name}</strong>: al
              guardarla queda vinculada y la solicitud pasa a cotizada.
            </p>
            <blockquote className="whitespace-pre-wrap border-l-2 border-primary/40 pl-3 text-muted-foreground">
              {fromRequest.idea}
            </blockquote>
          </div>
        )}
      </header>
      <RapidQuoteForm
        filaments={filaments}
        nonFilaments={nonFilaments}
        customers={customers}
        ventaDirectaId={ventaDirecta.id}
        efectivoId={efectivo.id}
        initialState={initialState}
        prefillNotice={notice.length > 0 ? notice : undefined}
        fromRequest={fromRequest}
      />
    </div>
  );
}
