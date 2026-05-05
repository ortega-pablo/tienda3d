import { BarChart3, Boxes, Download, FileText, History } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ReportLink {
  title: string;
  description: string;
  icon: typeof FileText;
  href: string;
  permission?: string;
}

const REPORTS: ReportLink[] = [
  {
    title: 'Cotizaciones',
    description:
      'Listado completo de cotizaciones (productos y rápidas) con cliente, canal, totales, estado y fechas.',
    icon: FileText,
    href: '/api/reports/quotes.csv',
    permission: 'quote:export',
  },
  {
    title: 'Stock actual',
    description:
      'Snapshot de cada insumo activo con stock, mínimo, desperdicio %, proveedor vigente, precio y valor en stock.',
    icon: Boxes,
    href: '/api/reports/stock-snapshot.csv',
    permission: 'stock:read',
  },
  {
    title: 'Movimientos de stock',
    description:
      'Histórico de ingresos, consumos por producción, ajustes manuales y desperdicios.',
    icon: History,
    href: '/api/reports/stock-movements.csv',
    permission: 'stock:read',
  },
];

export default async function ReportsPage() {
  const user = await requirePermission('quote:read');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Reportes</h1>
        <p className="text-muted-foreground">
          Exportá los datos del sistema en CSV para análisis externo o respaldos.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.filter((r) => !r.permission || user.permissions.includes(r.permission)).map(
          (r) => {
            const Icon = r.icon;
            return (
              <Card key={r.href}>
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{r.title}</CardTitle>
                  <CardDescription>{r.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <a href={r.href} download>
                      <Download className="h-4 w-4" />
                      Descargar CSV
                    </a>
                  </Button>
                </CardContent>
              </Card>
            );
          },
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            KPIs en vivo
          </CardTitle>
          <CardDescription>
            Para visualizar métricas del mes (cotizaciones, producciones, stock, top productos),
            mirá el <a href="/dashboard" className="text-primary hover:underline">Panel principal</a>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
