import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { CategoriesView, type CategoryNode } from './categories-view';

export default async function CategoriesPage() {
  await requirePermission('category:read');
  const tree = await api<CategoryNode[]>('/categories');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Categorías</h1>
        <p className="text-muted-foreground">
          Organizá los productos en categorías y subcategorías. Una jerarquía de hasta dos niveles
          (padre → subcategoría) — usadas para filtrar el catálogo del cliente mayorista.
        </p>
      </header>

      <CategoriesView initial={tree} />
    </div>
  );
}
