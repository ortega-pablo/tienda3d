import Link from 'next/link';
import { AlertTriangle, Boxes, Factory, FileText, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api-server';
import { requireUser } from '@/lib/auth';
import { formatMoney, formatNumber } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardKpis {
  quotesThisMonth: { count: number; total: number };
  quotesByStatus: Record<string, number>;
  productionsActive: number;
  productionsThisMonth: { count: number; totalCost: number };
  topProducts: Array<{ productId: string; name: string; quoted: number; produced: number }>;
  lowStock: Array<{
    materialId: string;
    name: string;
    currentStock: number;
    minStock: number;
    unit: string;
  }>;
  stockValue: number;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
};

export default async function DashboardPage() {
  const user = await requireUser();
  let kpis: DashboardKpis | null = null;
  try {
    kpis = await api<DashboardKpis>('/reports/dashboard');
  } catch {
    /* permission missing — show fallback */
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Hola, {user.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground">
          Resumen de actividad del mes en curso.
        </p>
      </header>

      {!kpis && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No tenés permisos para ver el resumen agregado.
          </CardContent>
        </Card>
      )}

      {kpis && (
        <>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={<FileText className="h-5 w-5" />}
              title="Cotizaciones del mes"
              primary={formatMoney(kpis.quotesThisMonth.total)}
              secondary={`${kpis.quotesThisMonth.count} cotizaciones`}
            />
            <KpiCard
              icon={<Factory className="h-5 w-5" />}
              title="Producciones del mes"
              primary={formatMoney(kpis.productionsThisMonth.totalCost)}
              secondary={`${kpis.productionsThisMonth.count} órdenes · ${kpis.productionsActive} activas`}
            />
            <KpiCard
              icon={<Boxes className="h-5 w-5" />}
              title="Valor en stock"
              primary={formatMoney(kpis.stockValue)}
              secondary="Insumos × precio vigente"
            />
            <KpiCard
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Alertas de stock"
              primary={kpis.lowStock.length.toString()}
              secondary="Insumos bajo el mínimo"
              tone={kpis.lowStock.length > 0 ? 'warning' : 'default'}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Top productos del mes
                </CardTitle>
                <CardDescription>Cotizados y producidos en unidades.</CardDescription>
              </CardHeader>
              <CardContent>
                {kpis.topProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin actividad este mes.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Producto</th>
                        <th className="py-2 pr-4 font-medium text-right">Cotizado</th>
                        <th className="py-2 pr-4 font-medium text-right">Producido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {kpis.topProducts.map((p) => (
                        <tr key={p.productId}>
                          <td className="py-2 pr-4">
                            <Link href={`/productos/${p.productId}`} className="hover:underline">
                              {p.name}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">
                            {formatNumber(p.quoted, 0)}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">
                            {formatNumber(p.produced, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Por estado</CardTitle>
                <CardDescription>Cotizaciones totales.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {Object.entries(kpis.quotesByStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {STATUS_LABEL[status] ?? status}
                    </span>
                    <span className="font-mono">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {kpis.lowStock.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Insumos bajo stock mínimo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Insumo</th>
                      <th className="py-2 pr-4 font-medium text-right">Stock actual</th>
                      <th className="py-2 pr-4 font-medium text-right">Mínimo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {kpis.lowStock.map((m) => (
                      <tr key={m.materialId}>
                        <td className="py-2 pr-4">{m.name}</td>
                        <td className="py-2 pr-4 text-right font-mono text-destructive">
                          {formatNumber(m.currentStock, 3)} {m.unit.toLowerCase()}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-muted-foreground">
                          {formatNumber(m.minStock, 3)} {m.unit.toLowerCase()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  title,
  primary,
  secondary,
  tone = 'default',
}: {
  icon: React.ReactNode;
  title: string;
  primary: string;
  secondary: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <span className={tone === 'warning' ? 'text-warning' : 'text-muted-foreground'}>
            {icon}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${tone === 'warning' ? 'text-warning' : ''}`}>
          {primary}
        </div>
        <p className="text-xs text-muted-foreground">{secondary}</p>
      </CardContent>
    </Card>
  );
}
