import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { MaterialsView, type MaterialDto, type SupplierLite } from './materials-view';

export default async function MaterialsPage() {
  await requirePermission('material:read');
  const [materials, suppliers] = await Promise.all([
    api<MaterialDto[]>('/materials'),
    api<SupplierLite[]>('/suppliers'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Insumos</h1>
        <p className="text-muted-foreground">
          Filamentos se agrupan por marca: el padre concentra precio y desperdicio, las variantes
          (colores) llevan stock propio y se eligen al fabricar.
        </p>
      </header>

      <MaterialsView initialMaterials={materials} suppliers={suppliers.filter((s) => s.isActive)} />
    </div>
  );
}
