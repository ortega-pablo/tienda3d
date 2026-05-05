import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatMoney, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';

interface ProductionDto {
  id: string;
  code: string;
  productId: string;
  productName: string;
  quantity: number;
  status: string;
  totalCostSnapshot: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export default async function ProductionsPage() {
  const user = await requirePermission('production:read');
  const orders = await api<ProductionDto[]>('/productions');
  const canExecute = user.permissions.includes('production:execute');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Producción</h1>
          <p className="text-muted-foreground">
            Órdenes de producción que descuentan stock automáticamente al completarse.
          </p>
        </div>
        {canExecute && (
          <Button asChild>
            <Link href="/produccion/nueva">
              <Plus className="h-4 w-4" />
              Nueva orden
            </Link>
          </Button>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{orders.length} órdenes</CardTitle>
          <CardDescription>Más recientes primero.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Código</th>
                <th className="py-2 pr-4 font-medium">Producto</th>
                <th className="py-2 pr-4 font-medium">Cantidad</th>
                <th className="py-2 pr-4 font-medium">Costo total</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 pr-4 font-mono">{o.code}</td>
                  <td className="py-3 pr-4">{o.productName}</td>
                  <td className="py-3 pr-4 font-mono">{formatNumber(o.quantity, 0)}</td>
                  <td className="py-3 pr-4 font-mono">{formatMoney(o.totalCostSnapshot)}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="py-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/produccion/${o.id}`}>Abrir</Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Sin órdenes aún.
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
