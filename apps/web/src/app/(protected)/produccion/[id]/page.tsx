import { notFound } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatMoney, formatNumber } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { ProductionActions, type ProductionDto } from './production-actions';

interface CostShape {
  fabricationPrice?: number;
}

interface ProductLite {
  targetMarkupPct: number;
}

export default async function ProductionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('production:read');
  const { id } = await params;

  let order: ProductionDto;
  try {
    order = await api<ProductionDto>(`/productions/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Estimated profit: fabricationPrice × markup × quantity (basado en el costo
  // y markup *actuales* del producto — no en un snapshot histórico).
  const [cost, product] = await Promise.all([
    api<CostShape>(`/products/${order.productId}/cost`).catch(() => null),
    api<ProductLite>(`/products/${order.productId}`).catch(() => null),
  ]);
  const fabricationPrice = cost?.fabricationPrice ?? null;
  const markupPct = product?.targetMarkupPct ?? null;
  const profitPerUnit =
    fabricationPrice != null && markupPct != null
      ? fabricationPrice * (markupPct / 100)
      : null;
  const profitTotal = profitPerUnit != null ? profitPerUnit * order.quantity : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-mono">{order.code}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-muted-foreground">
            <Link href={`/productos/${order.productId}`} className="hover:underline">
              {order.productName}
            </Link>{' '}
            · {formatNumber(order.quantity, 0)} unidades
          </p>
        </div>
        <ProductionActions order={order} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Consumo de insumos</CardTitle>
            <CardDescription>
              {order.status === 'DONE'
                ? 'Insumos descontados del stock.'
                : 'Se descontará al marcar la orden como completada.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Insumo</th>
                  <th className="py-2 pr-4 font-medium text-right">Receta</th>
                  <th className="py-2 pr-4 font-medium text-right">Desperdicio</th>
                  <th className="py-2 pr-4 font-medium text-right">Total a descontar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.consumption.map((c) => (
                  <tr key={c.materialId}>
                    <td className="py-3 pr-4">{c.materialName}</td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {formatNumber(c.recipeQty, 3)} {c.unit.toLowerCase()}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-muted-foreground">
                      {formatNumber(c.wastePct)}%
                    </td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold">
                      {formatNumber(c.totalQty, 3)} {c.unit.toLowerCase()}
                    </td>
                  </tr>
                ))}
                {order.consumption.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      Sin consumo previsto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Costo total snapshot" value={formatMoney(order.totalCostSnapshot)} />
            <Row label="Cantidad" value={formatNumber(order.quantity, 0)} />
            <Row
              label="Costo unitario"
              value={
                order.quantity > 0
                  ? formatMoney(order.totalCostSnapshot / order.quantity)
                  : '—'
              }
            />

            {profitTotal != null && profitPerUnit != null && (
              <div
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3"
                title="Ganancia estimada con el costo y markup actuales del producto. Se realiza al vender — no al producir."
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Ganancia de bolsillo estimada
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatMoney(profitPerUnit)} /unidad
                      {markupPct != null && ` · ${formatNumber(markupPct)}%`}
                    </div>
                  </div>
                  <div className="font-mono text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatMoney(profitTotal)}
                  </div>
                </div>
              </div>
            )}
            <Row
              label="Creada"
              value={new Date(order.createdAt).toLocaleString('es-AR')}
            />
            {order.startedAt && (
              <Row
                label="Iniciada"
                value={new Date(order.startedAt).toLocaleString('es-AR')}
              />
            )}
            {order.finishedAt && (
              <Row
                label="Finalizada"
                value={new Date(order.finishedAt).toLocaleString('es-AR')}
              />
            )}
            {order.notes && (
              <div className="border-t pt-2">
                <div className="text-xs text-muted-foreground">Notas</div>
                <p className="mt-1 text-sm">{order.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono">{value}</span>
    </div>
  );
}
