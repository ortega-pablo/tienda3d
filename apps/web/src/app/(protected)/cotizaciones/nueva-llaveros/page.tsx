import { notFound } from 'next/navigation';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  RapidQuoteForm,
  type CustomerOption,
  type FilamentLite,
  type KeychainTierLite,
  type MaterialLite,
} from '../nueva-a-medida/rapid-quote-form';

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

export default async function NewKeychainQuotePage() {
  const user = await requirePermission('quote:create');
  const canReadCustomers = user.permissions.includes('customer:read');

  const [channels, filaments, materials, customers, keychainTiers, params] =
    await Promise.all([
      api<ChannelLite[]>('/channels'),
      api<FilamentLite[]>('/materials?type=FILAMENT&activeOnly=true'),
      api<MaterialLite[]>('/materials'),
      canReadCustomers
        ? api<CustomerOption[]>('/customers?activeOnly=true')
        : Promise.resolve([] as CustomerOption[]),
      api<KeychainTierLite[]>('/keychain-tiers'),
      api<ParamDto[]>('/parameters'),
    ]);
  const nonFilaments = materials.filter((m) => m.type !== 'FILAMENT' && m.isActive);

  const ventaDirecta = channels.find((c) => c.slug === 'directa' && c.isActive);
  const efectivo = channels.find((c) => c.slug === 'efectivo' && c.isActive);
  if (!ventaDirecta || !efectivo) {
    notFound();
  }

  const batchSizeParam = params.find((p) => p.key === 'keychain_batch_size');
  const batchSize = batchSizeParam
    ? Math.max(1, Math.floor(Number(batchSizeParam.value)))
    : DEFAULT_BATCH_SIZE;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cotización de llaveros</h1>
        <p className="text-muted-foreground">
          Cotizá llaveros personalizados en cantidad usando la escala fija del taller. La
          cantidad debe ser 1-4 o múltiplo de 5 (5, 10, 15, …, 100, 105, …). Cada tier
          aplica su propio markup, editable desde{' '}
          <span className="font-mono text-xs">/parametros/llaveros</span>.
        </p>
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p>
            <strong>Carga los valores para un batch de {batchSize} llaveros</strong> — los
            gramos, minutos y consumos que ingreses deben ser el total para producir{' '}
            {batchSize} unidades (una bandeja de impresión típica). El sistema divide
            internamente para calcular el costo por unidad. Para cantidades entre 1 y{' '}
            {batchSize - 1} el precio se prorratea; para múltiplos de {batchSize} el precio
            escala con la cantidad.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            El tamaño del batch se configura en{' '}
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
      />
    </div>
  );
}
