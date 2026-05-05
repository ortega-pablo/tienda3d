import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { NewProductionForm, type ProductLite, type FilamentLite } from './new-production-form';

export default async function NewProductionPage() {
  await requirePermission('production:execute');
  const [products, materials] = await Promise.all([
    api<ProductLite[]>('/products'),
    api<FilamentLite[]>('/materials?type=FILAMENT&activeOnly=true'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Nueva orden de producción</h1>
        <p className="text-muted-foreground">
          Selecciona el producto, la cantidad y los colores de filamento por pieza.
        </p>
      </header>
      <NewProductionForm products={products.filter((p) => p.isActive)} filaments={materials} />
    </div>
  );
}
