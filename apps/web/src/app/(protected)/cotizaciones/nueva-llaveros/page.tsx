import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  RapidQuoteForm,
  type ChannelLite,
  type CustomerOption,
  type FilamentLite,
  type KeychainTierLite,
  type MaterialLite,
} from '../nueva-a-medida/rapid-quote-form';

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
        channels={channels.filter((c) => c.isActive)}
        filaments={filaments}
        nonFilaments={nonFilaments}
        customers={customers}
        keychainTiers={keychainTiers}
      />
    </div>
  );
}
