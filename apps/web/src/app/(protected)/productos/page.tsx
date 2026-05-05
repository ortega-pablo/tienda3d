import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProductSummaryDto {
  id: string;
  name: string;
  sku: string | null;
  isActive: boolean;
  imageUrl: string | null;
  pieceCount: number;
  materialCount: number;
  totalGrams: number;
  totalPrintMinutes: number;
}

export default async function ProductsPage() {
  const user = await requirePermission('product:read');
  const products = await api<ProductSummaryDto[]>('/products');
  const canWrite = user.permissions.includes('product:write');

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
          <CardTitle>{products.length} productos</CardTitle>
          <CardDescription>Activos e inactivos.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Producto</th>
                <th className="py-2 pr-4 font-medium">Piezas</th>
                <th className="py-2 pr-4 font-medium">Insumos extra</th>
                <th className="py-2 pr-4 font-medium">Filamento</th>
                <th className="py-2 pr-4 font-medium">Tiempo impresión</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{p.name}</div>
                    {p.sku && (
                      <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                    )}
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
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Sin productos cargados.
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
