import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeychainTiersForm, type KeychainTierDto } from './keychain-tiers-form';

export default async function KeychainTiersPage() {
  await requirePermission('parameter:read');
  const tiers = await api<KeychainTierDto[]>('/keychain-tiers');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Markups de llaveros</h1>
        <p className="text-muted-foreground">
          Escala fija de 5 tiers para cotización de llaveros personalizados en cantidad. La
          estructura no cambia (1-4, 5-20, 25-35, 40-95, 100+); solo se edita el markup de cada
          tier. Cada cambio queda registrado en el log de auditoría.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Tiers</CardTitle>
          <CardDescription>
            El markup se aplica sobre el costo de fabricación, igual que en productos del
            catálogo. Cantidades mayores típicamente llevan markup menor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeychainTiersForm initial={tiers} />
        </CardContent>
      </Card>
    </div>
  );
}
