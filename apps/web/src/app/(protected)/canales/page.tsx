import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelsManager, type ChannelDto } from './channels-manager';
import { GlobalPricingCard } from './global-pricing-card';

interface ParameterDto {
  key: string;
  value: string;
}

export default async function ChannelsPage() {
  await requirePermission('channel:read');
  const [channels, parameters] = await Promise.all([
    api<ChannelDto[]>('/channels'),
    api<ParameterDto[]>('/parameters'),
  ]);
  const directSaleCommissionPct = Number(
    parameters.find((p) => p.key === 'direct_sale_commission_pct')?.value ?? '0',
  );
  const unifiedRegimePct = Number(
    parameters.find((p) => p.key === 'unified_regime_pct')?.value ?? '0',
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Canales de venta</h1>
        <p className="text-muted-foreground">
          La comisión de Venta Directa y el régimen unificado son globales. Cada canal sólo declara
          su comportamiento propio (tipo, modo tributario detallado si aplica).
        </p>
      </header>

      <GlobalPricingCard
        directSaleCommissionPct={directSaleCommissionPct}
        unifiedRegimePct={unifiedRegimePct}
      />

      <Card>
        <CardHeader>
          <CardTitle>{channels.length} canales</CardTitle>
          <CardDescription>Activos e inactivos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChannelsManager initial={channels} />
        </CardContent>
      </Card>
    </div>
  );
}
