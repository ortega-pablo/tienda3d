'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface MachineHour {
  machineId: string | null;
  machineName: string | null;
  depreciationPerHour: number;
  energyPerHour: number;
  maintenancePerHour: number;
  total: number;
}

export function MachineHourCard({ initial }: { initial: MachineHour }) {
  const [hour, setHour] = useState(initial);

  // Refresh when route changes (e.g. after saving parameters)
  useEffect(() => {
    setHour(initial);
  }, [initial]);

  // Cheap polling so the card stays current if the user opens machines in another tab.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const fresh = await api<MachineHour>('/parameters/machine-hour');
        setHour(fresh);
      } catch {
        /* ignore — stay on last known */
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Hora-máquina</CardTitle>
        </div>
        <CardDescription>
          {hour.machineName ?? 'Sin equipo activo. Configurá uno en /equipos.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{formatMoney(hour.total)}</div>
        <div className="text-xs text-muted-foreground">por hora</div>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Depreciación" value={hour.depreciationPerHour} />
          <Row label="Energía" value={hour.energyPerHour} />
          <Row label="Mantenimiento" value={hour.maintenancePerHour} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b pb-1 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{formatMoney(value)}</dd>
    </div>
  );
}
