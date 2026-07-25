import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import {
  ProductEditor,
  type CategoryLite,
  type ChannelLite,
  type MachineLite,
  type MaterialLite,
} from '../[id]/product-editor';

export default async function NewKeychainProductPage() {
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
        <h1 className="text-3xl font-bold">Nuevo producto tipo llavero</h1>
        <p className="text-muted-foreground">
          Cargá las piezas en dos secciones (individual y tanda de 5), más insumos y
          adicionales por unidad. Los markups por escala se editan en Parámetros.
        </p>
      </header>
      <ProductEditor
        mode="create"
        variant="keychain"
        materials={materials.filter((m) => m.isActive)}
        availableChannels={channels.filter((c) => c.isActive)}
        machines={machines}
        categories={categories}
      />
    </div>
  );
}
