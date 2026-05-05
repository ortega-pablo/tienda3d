import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  directSaleCommissionPct: number;
  unifiedRegimePct: number;
}

export function GlobalPricingCard({ directSaleCommissionPct, unifiedRegimePct }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Configuración global de pricing</CardTitle>
            <CardDescription>
              Aplica a todos los canales. La comisión rige Venta Directa; el régimen unificado se
              aplica a cualquier canal en modo simple.
            </CardDescription>
          </div>
          <Link
            href="/parametros"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Editar en Parámetros
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyValue
            label="Comisión Venta Directa"
            value={`${formatNumber(directSaleCommissionPct)}%`}
            help="Se descuenta del precio en el canal Venta Directa."
          />
          <ReadOnlyValue
            label="Régimen unificado (modo simple)"
            value={`${formatNumber(unifiedRegimePct)}%`}
            help="Régimen tributario para canales en modo simple."
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ReadOnlyValue({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 font-mono text-sm">
        {value}
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
