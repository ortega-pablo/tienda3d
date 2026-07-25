import { notFound } from 'next/navigation';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  RapidQuoteForm,
  type CustomerOption,
  type KeychainDefaultsLite,
  type KeychainTierLite,
  type RapidQuoteInitialState,
} from '../nueva-a-medida/rapid-quote-form';
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

interface ParamDto {
  key: string;
  value: string;
}

const DEFAULT_BATCH_SIZE = 5;

export default async function NewKeychainQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requirePermission('quote:create');
  const canReadCustomers = user.permissions.includes('customer:read');
  const { from } = await searchParams;

  const [channels, materials, customers, keychainTiers, params, keychainDefaults] =
    await Promise.all([
      api<ChannelLite[]>('/channels'),
      api<MaterialFull[]>('/materials'),
      canReadCustomers
        ? api<CustomerOption[]>('/customers?activeOnly=true')
        : Promise.resolve([] as CustomerOption[]),
      api<KeychainTierLite[]>('/keychain-scale-tiers'),
      api<ParamDto[]>('/parameters'),
      api<KeychainDefaultsLite>('/keychain-defaults'),
    ]);

  const ventaDirecta = channels.find((c) => c.slug === 'directa' && c.isActive);
  const efectivo = channels.find((c) => c.slug === 'efectivo' && c.isActive);
  if (!ventaDirecta || !efectivo) {
    notFound();
  }

  const batchSizeParam = params.find((p) => p.key === 'keychain_batch_size');
  const batchSize = batchSizeParam
    ? Math.max(1, Math.floor(Number(batchSizeParam.value)))
    : DEFAULT_BATCH_SIZE;

  let initialState: RapidQuoteInitialState | undefined;
  let ref: { filamentIds: string[]; materialIds: string[] } | null = null;

  if (from) {
    const quote = await api<QuoteForPrefill>(`/quotes/${from}`).catch(() => null);
    if (quote && quote.type === 'ADHOC') {
      initialState = buildRapidInitialState(quote, true);
      ref = referencedMaterialIds(quote);
    }
  }

  const { filaments, nonFilaments, notice } = buildAdhocOptionLists(materials, ref);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cotización de llaveros</h1>
        <p className="text-muted-foreground">
          Cotizá llaveros personalizados en <strong>cualquier cantidad</strong> con las
          escalas contiguas del taller (1-4, 5-24, 25-49, 50-99, 100+). Cada escala aplica
          su propio markup, editable desde{' '}
          <span className="font-mono text-xs">/parametros/llaveros</span>.
        </p>
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p>
            Cargá las piezas en dos secciones: <strong>individual</strong> (para 1
            llavero, base de 1-4) y <strong>tanda</strong> (la placa de {batchSize}, base
            de 5+, se divide por {batchSize}). Los <strong>insumos y adicionales son por
            unidad</strong>. Ej.: para 7 llaveros el precio usa la base de tanda ÷{' '}
            {batchSize} con el markup de la escala 5-24.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            El tamaño de la tanda se configura en{' '}
            <span className="font-mono">/parametros</span> (keychain_batch_size).
          </p>
        </div>
      </header>
      <RapidQuoteForm
        mode="keychain"
        filaments={filaments}
        nonFilaments={nonFilaments}
        customers={customers}
        ventaDirectaId={ventaDirecta.id}
        efectivoId={efectivo.id}
        keychainTiers={keychainTiers}
        batchSize={batchSize}
        keychainDefaults={keychainDefaults}
        initialState={initialState}
        prefillNotice={notice.length > 0 ? notice : undefined}
      />
    </div>
  );
}
