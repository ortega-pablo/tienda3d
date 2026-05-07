import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { ProductEditor } from '../[id]/product-editor';

interface MaterialLite {
  id: string;
  name: string;
  type: 'FILAMENT' | 'SHEET' | 'PACKAGING' | 'HARDWARE' | 'OTHER';
  unit: 'KG' | 'G' | 'UNIT' | 'REAM' | 'METER' | 'LITER';
  parentId: string | null;
  colorHex: string | null;
  isActive: boolean;
}

interface ChannelLite {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  kind: 'DIRECT_SALE' | 'CASH' | 'MARKETPLACE' | 'CUSTOM';
  isActive: boolean;
  isSystem: boolean;
}

interface MachineLite {
  id: string;
  name: string;
  isActive: boolean;
}

export default async function NewProductPage() {
  await requirePermission('product:write');
  const [materials, channels, machines] = await Promise.all([
    api<MaterialLite[]>('/materials'),
    api<ChannelLite[]>('/channels'),
    api<MachineLite[]>('/machines'),
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
      />
    </div>
  );
}
