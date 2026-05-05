import { Check, X } from 'lucide-react';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface IntegrationStatus {
  key: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  notes?: string;
}

export default async function IntegrationsPage() {
  await requirePermission('user:read');
  const integrations = await api<IntegrationStatus[]>('/integrations');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Integraciones</h1>
        <p className="text-muted-foreground">
          Conectores externos. Cada uno se activa con su variable de entorno y credenciales en{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((i) => (
          <Card key={i.key}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{i.label}</CardTitle>
                <Pill ok={i.enabled} label={i.enabled ? 'Habilitada' : 'Deshabilitada'} />
              </div>
              <CardDescription className="break-all font-mono text-xs">
                INTEGRATION_{i.key.toUpperCase()}_ENABLED
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                {i.configured ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <X className="h-4 w-4 text-destructive" />
                )}
                <span>
                  {i.configured ? 'Credenciales cargadas' : 'Sin credenciales'}
                </span>
              </div>
              {i.notes && <p className="text-xs text-muted-foreground">{i.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? 'inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs text-success'
          : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
      }
    >
      {label}
    </span>
  );
}
