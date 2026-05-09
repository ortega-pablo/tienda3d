'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export interface ProductSummaryDto {
  id: string;
  name: string;
  sku: string | null;
  isActive: boolean;
  imageUrl: string | null;
  pieceCount: number;
  materialCount: number;
  totalGrams: number;
  totalPrintMinutes: number;
  machineId: string | null;
  machineName: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  children?: CategoryNode[];
}

const NO_CATEGORY = '__NO_CATEGORY__';

export function ProductsList({
  products,
  categories,
  canWrite,
}: {
  products: ProductSummaryDto[];
  categories: CategoryNode[];
  canWrite: boolean;
}) {
  const [filter, setFilter] = useState<string>('');
  // categoryId seleccionado: '' = todos, NO_CATEGORY = sin categoría, o un id concreto.
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Para que filtrar por categoría padre incluya sus subcategorías.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const parent of categories) {
      map.set(parent.id, (parent.children ?? []).map((c) => c.id));
    }
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.sku ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (categoryFilter === NO_CATEGORY) {
        return p.categoryId == null;
      }
      if (categoryFilter) {
        if (p.categoryId === categoryFilter) return true;
        const childIds = childrenByParent.get(categoryFilter) ?? [];
        return p.categoryId != null && childIds.includes(p.categoryId);
      }
      return true;
    });
  }, [products, filter, categoryFilter, childrenByParent]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Productos</h1>
          <p className="text-muted-foreground">
            Cada producto define su receta (piezas + insumos) y se costea automáticamente.
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/productos/nuevo">
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Link>
          </Button>
        )}
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>{filtered.length} productos</CardTitle>
              <CardDescription>
                {categoryFilter || filter ? 'Filtrados.' : 'Activos e inactivos.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Buscar</label>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Nombre o SKU…"
                  className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Categoría</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="flex h-9 w-56 rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="">Todas</option>
                  <option value={NO_CATEGORY}>Sin categoría</option>
                  {categories.map((parent) => (
                    <optgroup key={parent.id} label={parent.name}>
                      <option value={parent.id}>
                        {parent.name} (incluye subcategorías)
                      </option>
                      {(parent.children ?? []).map((child) => (
                        <option key={child.id} value={child.id}>
                          ↳ {child.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Producto</th>
                <th className="py-2 pr-4 font-medium">Categoría</th>
                <th className="py-2 pr-4 font-medium">Piezas</th>
                <th className="py-2 pr-4 font-medium">Insumos extra</th>
                <th className="py-2 pr-4 font-medium">Filamento</th>
                <th className="py-2 pr-4 font-medium">Tiempo impresión</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{p.name}</div>
                    {p.sku && (
                      <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {p.categoryName ?? '—'}
                  </td>
                  <td className="py-3 pr-4">{p.pieceCount}</td>
                  <td className="py-3 pr-4">{p.materialCount}</td>
                  <td className="py-3 pr-4 font-mono">{formatNumber(p.totalGrams)} g</td>
                  <td className="py-3 pr-4 font-mono">
                    {formatNumber(p.totalPrintMinutes, 0)} min
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        p.isActive
                          ? 'inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs text-success'
                          : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                      }
                    >
                      {p.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/productos/${p.id}`}>Abrir</Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {products.length === 0
                      ? 'Sin productos cargados.'
                      : 'No hay productos con esos filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
