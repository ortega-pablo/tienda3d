import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { CustomerEditor } from '../[id]/customer-editor';
import type { ChannelLite } from '../types';

export default async function NewCustomerPage() {
  await requirePermission('customer:write');
  const channels = await api<ChannelLite[]>('/channels');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Nuevo cliente</h1>
        <p className="text-muted-foreground">
          Cargá los datos básicos. Las categorías asociadas y los productos asignados se
          configuran después de crear el cliente.
        </p>
      </header>
      <CustomerEditor mode="create" availableChannels={channels.filter((c) => c.isActive)} />
    </div>
  );
}
