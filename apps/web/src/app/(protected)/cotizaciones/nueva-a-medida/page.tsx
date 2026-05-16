import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  RapidQuoteForm,
  type ChannelLite,
  type CustomerOption,
  type FilamentLite,
  type MaterialLite,
} from './rapid-quote-form';

export default async function NewRapidQuotePage() {
  const user = await requirePermission('quote:create');
  const canReadCustomers = user.permissions.includes('customer:read');

  const [channels, filaments, materials, customers] = await Promise.all([
    api<ChannelLite[]>('/channels'),
    api<FilamentLite[]>('/materials?type=FILAMENT&activeOnly=true'),
    api<MaterialLite[]>('/materials'),
    canReadCustomers
      ? api<CustomerOption[]>('/customers?activeOnly=true')
      : Promise.resolve([] as CustomerOption[]),
  ]);
  const nonFilaments = materials.filter((m) => m.type !== 'FILAMENT' && m.isActive);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cotización a medida</h1>
        <p className="text-muted-foreground">
          Para piezas personalizadas que no están en el catálogo. Cargás material, gramaje,
          tiempo de impresión y mano de obra de cada componente para obtener un precio. Ideal
          para consultas que llegan por WhatsApp con "tengo esta pieza, ¿cuánto sale?".
        </p>
      </header>
      <RapidQuoteForm
        channels={channels.filter((c) => c.isActive)}
        filaments={filaments}
        nonFilaments={nonFilaments}
        customers={customers}
      />
    </div>
  );
}
