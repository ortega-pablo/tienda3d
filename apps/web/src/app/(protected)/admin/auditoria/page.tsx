import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditLogView, type AuditLog } from './audit-log-view';

export default async function AuditPage() {
  await requirePermission('audit:read');
  const logs = await api<AuditLog[]>('/audit?limit=200');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Auditoría</h1>
        <p className="text-muted-foreground">
          Cambios sensibles en parámetros, permisos, cotizaciones y producción.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Últimos {logs.length} eventos</CardTitle>
          <CardDescription>Filtrá por entidad para acotar.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogView initialLogs={logs} />
        </CardContent>
      </Card>
    </div>
  );
}
