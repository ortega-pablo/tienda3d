import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  ProductEditor,
  type CategoryLite,
  type ChannelLite,
  type MachineLite,
  type MaterialLite,
} from '../[id]/product-editor';

export default async function NewProductPage() {
  await requirePermission('product:write');
  const [materials, channels, machines, categories] = await Promise.all([
    api<MaterialLite[]>('/materials'),
    api<ChannelLite[]>('/channels'),
    api<MachineLite[]>('/machines'),
    api<CategoryLite[]>('/categories'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Nuevo producto</h1>
        <p className="text-muted-foreground">
          Definí piezas, insumos y canales de venta. Venta Directa y Efectivo vienen pre-seleccionados.
        </p>
      </header>
      <ProductEditor
        mode="create"
        materials={materials.filter((m) => m.isActive)}
        availableChannels={channels.filter((c) => c.isActive)}
        machines={machines}
        categories={categories}
      />
    </div>
  );
}
