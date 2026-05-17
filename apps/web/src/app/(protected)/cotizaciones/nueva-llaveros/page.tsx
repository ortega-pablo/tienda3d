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

export default async function NewKeychainQuotePage() {
  const user = await requirePermission('quote:create');
  const canReadCustomers = user.permissions.includes('customer:read');

  const [channels, filaments, materials, customers, keychainTiers] = await Promise.all([
    api<ChannelLite[]>('/channels'),
    api<FilamentLite[]>('/materials?type=FILAMENT&activeOnly=true'),
    api<MaterialLite[]>('/materials'),
    canReadCustomers
      ? api<CustomerOption[]>('/customers?activeOnly=true')
      : Promise.resolve([] as CustomerOption[]),
    api<KeychainTierLite[]>('/keychain-tiers'),
  ]);
  const nonFilaments = materials.filter((m) => m.type !== 'FILAMENT' && m.isActive);

  const ventaDirecta = channels.find((c) => c.slug === 'directa' && c.isActive);
  const efectivo = channels.find((c) => c.slug === 'efectivo' && c.isActive);
  if (!ventaDirecta || !efectivo) {
    notFound();
  }

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
      </header>
      <RapidQuoteForm
        mode="keychain"
        filaments={filaments}
        nonFilaments={nonFilaments}
        customers={customers}
        ventaDirectaId={ventaDirecta.id}
        efectivoId={efectivo.id}
        keychainTiers={keychainTiers}
      />
    </div>
  );
}
