import Link from 'next/link';
import { Package, Zap } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function NewQuoteChooserPage() {
  await requirePermission('quote:create');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Nueva cotización</h1>
        <p className="text-muted-foreground">¿Qué tipo de cotización querés generar?</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/cotizaciones/nueva-producto" className="group">
          <Card className="h-full transition hover:border-primary hover:shadow">
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Package className="h-5 w-5" />
              </div>
              <CardTitle className="group-hover:text-primary">Producto del catálogo</CardTitle>
              <CardDescription>
                Cotizá uno o varios productos guardados en el sistema. Aplica escalas mayoristas
                automáticamente y permite cambiar colores de filamento por pieza. Código{' '}
                <span className="font-mono">Q-…</span>
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/cotizaciones/nueva-rapida" className="group">
          <Card className="h-full transition hover:border-accent hover:shadow">
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                <Zap className="h-5 w-5" />
              </div>
              <CardTitle className="group-hover:text-accent">Cotización rápida</CardTitle>
              <CardDescription>
                Para piezas a medida o servicios sin un producto definido. Cargás gramos, tiempo y
                filamento de cada componente y obtenés precio en segundos. Código{' '}
                <span className="font-mono">R-…</span>
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
