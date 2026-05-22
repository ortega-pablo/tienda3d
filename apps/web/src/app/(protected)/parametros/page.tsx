import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatabaseBackupCard } from './database-backup-card';
import { ParametersForm } from './parameters-form';
import { MachineHourCard } from './machine-hour-card';

interface ParameterDto {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}
interface MachineHour {
  machineId: string | null;
  machineName: string | null;
  depreciationPerHour: number;
  energyPerHourRaw?: number;
  energyMarkupPct?: number;
  energyPerHour: number;
  maintenancePerHour: number;
  total: number;
}

export default async function ParametersPage() {
  await requirePermission('parameter:read');
  const [parameters, hour] = await Promise.all([
    api<ParameterDto[]>('/parameters'),
    api<MachineHour>('/parameters/machine-hour'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Parámetros globales</h1>
        <p className="text-muted-foreground">
          Estos valores afectan el cálculo de costo de todos los productos. Cuando los modificás se
          recalcula la hora-máquina al instante.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Editar parámetros</CardTitle>
            <CardDescription>Cambios aplican inmediatamente al guardar.</CardDescription>
          </CardHeader>
          <CardContent>
            <ParametersForm initial={parameters} />
          </CardContent>
        </Card>

        <MachineHourCard initial={hour} />
      </div>

      <DatabaseBackupCard />
    </div>
  );
}
