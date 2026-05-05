import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MachinesList } from './machines-list';

interface MachineDto {
  id: string;
  name: string;
  isActive: boolean;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeHours: number;
  powerW: number;
  annualMaintenance: number;
  annualUsageHours: number;
  notes: string | null;
}

interface MachineHour {
  machineId: string | null;
  machineName: string | null;
  depreciationPerHour: number;
  energyPerHour: number;
  maintenancePerHour: number;
  total: number;
}

export default async function MachinesPage() {
  await requirePermission('machine:read');
  const [machines, hour] = await Promise.all([
    api<MachineDto[]>('/machines'),
    api<MachineHour>('/machines/active/hour-cost'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Equipos</h1>
        <p className="text-muted-foreground">
          Configura las impresoras y selecciona cuál se usa para calcular la hora-máquina.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Impresoras</CardTitle>
          <CardDescription>
            Solo una puede estar activa por vez. Activar una desactiva las demás automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MachinesList initialMachines={machines} initialHour={hour} />
        </CardContent>
      </Card>
    </div>
  );
}
