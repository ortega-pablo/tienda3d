import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  RapidQuoteForm,
  type ChannelLite,
  type FilamentLite,
  type MaterialLite,
} from './rapid-quote-form';

export default async function NewRapidQuotePage() {
  await requirePermission('quote:create');
  const [channels, filaments, materials] = await Promise.all([
    api<ChannelLite[]>('/channels'),
    api<FilamentLite[]>('/materials?type=FILAMENT&activeOnly=true'),
    api<MaterialLite[]>('/materials'),
  ]);
  const nonFilaments = materials.filter((m) => m.type !== 'FILAMENT' && m.isActive);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cotización rápida</h1>
        <p className="text-muted-foreground">
          Para piezas a medida o servicios sin un producto definido en el catálogo. Ideal para
          consultas que llegan por WhatsApp con "tengo esta pieza, ¿cuánto sale?".
        </p>
      </header>
      <RapidQuoteForm
        channels={channels.filter((c) => c.isActive)}
        filaments={filaments}
        nonFilaments={nonFilaments}
      />
    </div>
  );
}
