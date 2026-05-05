'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, Power, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { formatMoney, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHasPermission } from '@/components/user-provider';

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
  total: number;
  depreciationPerHour: number;
  energyPerHour: number;
  maintenancePerHour: number;
  machineName: string | null;
}

const EMPTY: MachineDto = {
  id: '',
  name: '',
  isActive: false,
  acquisitionCost: 0,
  residualValue: 0,
  usefulLifeHours: 6000,
  powerW: 250,
  annualMaintenance: 0,
  annualUsageHours: 2000,
  notes: null,
};

const FIELDS: Array<{
  key: keyof Omit<MachineDto, 'id' | 'isActive' | 'notes' | 'name'>;
  label: string;
  suffix: string;
}> = [
  { key: 'acquisitionCost', label: 'Costo de adquisición', suffix: '$' },
  { key: 'residualValue', label: 'Valor residual', suffix: '$' },
  { key: 'usefulLifeHours', label: 'Vida útil', suffix: 'h' },
  { key: 'powerW', label: 'Consumo eléctrico', suffix: 'W' },
  { key: 'annualMaintenance', label: 'Mantenimiento anual', suffix: '$' },
  { key: 'annualUsageHours', label: 'Horas uso/año', suffix: 'h' },
];

export function MachinesList({
  initialMachines,
  initialHour,
}: {
  initialMachines: MachineDto[];
  initialHour: MachineHour;
}) {
  const can = useHasPermission();
  const canWrite = can('machine:write');
  const router = useRouter();
  const [machines, setMachines] = useState(initialMachines);
  const [editing, setEditing] = useState<MachineDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const startEdit = (m: MachineDto) => setEditing({ ...m });
  const startNew = () => setEditing({ ...EMPTY });

  const handleSave = async () => {
    if (!editing) return;
    setError(null);
    setPendingId(editing.id || 'new');
    try {
      const payload = {
        name: editing.name,
        acquisitionCost: editing.acquisitionCost,
        residualValue: editing.residualValue,
        usefulLifeHours: editing.usefulLifeHours,
        powerW: editing.powerW,
        annualMaintenance: editing.annualMaintenance,
        annualUsageHours: editing.annualUsageHours,
        notes: editing.notes,
      };
      if (editing.id) {
        const updated = await api<MachineDto>(`/machines/${editing.id}`, {
          method: 'PATCH',
          body: payload,
        });
        setMachines((list) => list.map((m) => (m.id === updated.id ? updated : m)));
      } else {
        const created = await api<MachineDto>('/machines', { method: 'POST', body: payload });
        setMachines((list) => [...list, created]);
      }
      setEditing(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setPendingId(null);
    }
  };

  const activate = async (id: string) => {
    setPendingId(id);
    try {
      await api(`/machines/${id}/activate`, { method: 'PATCH' });
      setMachines((list) => list.map((m) => ({ ...m, isActive: m.id === id })));
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo activar');
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este equipo?')) return;
    setPendingId(id);
    try {
      await api(`/machines/${id}`, { method: 'DELETE' });
      setMachines((list) => list.filter((m) => m.id !== id));
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Hora-máquina activa: </span>
          <span className="font-mono font-semibold">{formatMoney(initialHour.total)}</span>
          {initialHour.machineName && (
            <span className="text-muted-foreground"> · {initialHour.machineName}</span>
          )}
        </div>
        {canWrite && (
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" />
            Nuevo equipo
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-3">
        {machines.map((m) => (
          <div
            key={m.id}
            className={
              m.isActive
                ? 'flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-primary bg-primary/5 p-4'
                : 'flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4'
            }
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">{m.name}</span>
                {m.isActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium uppercase text-primary-foreground">
                    <Check className="h-3 w-3" /> activa
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatMoney(m.acquisitionCost)} · {formatNumber(m.powerW, 0)} W ·{' '}
                {formatNumber(m.annualUsageHours, 0)} h/año
              </p>
            </div>
            <div className="flex gap-2">
              {canWrite && !m.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => activate(m.id)}
                  disabled={pendingId === m.id}
                >
                  <Power className="h-4 w-4" />
                  Activar
                </Button>
              )}
              {canWrite && (
                <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>
                  Editar
                </Button>
              )}
              {canWrite && !m.isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(m.id)}
                  disabled={pendingId === m.id}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-2xl rounded-lg border bg-card shadow-lg">
            <div className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">
                {editing.id ? 'Editar equipo' : 'Nuevo equipo'}
              </h2>
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <div className="relative">
                      <Input
                        id={f.key}
                        type="number"
                        step="any"
                        value={editing[f.key]}
                        onChange={(e) =>
                          setEditing({ ...editing, [f.key]: Number(e.target.value) })
                        }
                        className="pr-10"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                        {f.suffix}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notas</Label>
                <Input
                  id="notes"
                  value={editing.notes ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value || null })
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={!editing.name || pendingId !== null}>
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
