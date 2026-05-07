'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Save, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useEditMode } from '@/hooks/use-edit-mode';
import { useHasPermission } from '@/components/user-provider';

interface ParameterDto {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

const META: Record<string, { label: string; suffix?: string; type?: 'number' | 'text'; help?: string }> = {
  kwh_cost: { label: 'Costo del kWh', suffix: '$/kWh', type: 'number', help: 'Con todos los impuestos.' },
  labor_hour_cost: { label: 'Hora de mano de obra', suffix: '$/h', type: 'number' },
  contingency_pct: { label: 'Contingencia', suffix: '%', type: 'number' },
  reinvestment_pct: { label: 'Reinversión', suffix: '%', type: 'number' },
  unified_regime_pct: {
    label: 'Régimen unificado (modo simple)',
    suffix: '%',
    type: 'number',
    help: 'Aplicado a todos los canales en modo simple. Efectivo lo omite cuando el admin marca "sin régimen".',
  },
  direct_sale_commission_pct: {
    label: 'Comisión Venta Directa',
    suffix: '%',
    type: 'number',
    help: 'Se descuenta del precio en el canal Venta Directa (no se carga al producto).',
  },
  labor_markup_pct: {
    label: 'Recargo extra mano de obra',
    suffix: '%',
    type: 'number',
    help: 'Recargo sobre el costo crudo de la hora de obra. Cubre overhead que no entra en provisiones.',
  },
  kwh_markup_pct: {
    label: 'Recargo extra energía eléctrica',
    suffix: '%',
    type: 'number',
    help: 'Recargo sobre el costo del kWh. Plegado dentro de la hora-máquina.',
  },
  currency: { label: 'Moneda', type: 'text', help: 'Código ISO 4217.' },
};

export function ParametersForm({ initial }: { initial: ParameterDto[] }) {
  const can = useHasPermission();
  const canWrite = can('parameter:write');
  const router = useRouter();

  const initialValues = Object.fromEntries(initial.map((p) => [p.key, p.value]));
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const editMode = useEditMode();

  const reset = () => setValues(initialValues);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await editMode.save(
      async () => {
        await api('/parameters', { method: 'PATCH', body: { values } });
        router.refresh();
      },
      { successMessage: 'Parámetros actualizados.' },
    );
  };

  const disabled = !editMode.editing;

  const isFormValid = initial.every((p) => {
    const meta = META[p.key];
    const raw = values[p.key];
    if (raw == null || raw.trim() === '') return false;
    if ((meta?.type ?? 'text') === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0;
    }
    return true;
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          {!editMode.editing ? (
            <Button type="button" variant="outline" onClick={editMode.start}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => editMode.cancel(reset)}
                disabled={editMode.saving}
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button type="submit" disabled={editMode.saving || !isFormValid}>
                {editMode.saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                {editMode.saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {initial.map((p) => {
          const meta = META[p.key] ?? { label: p.key };
          return (
            <div key={p.key} className="space-y-1.5">
              <Label htmlFor={p.key} required>
                {meta.label}
              </Label>
              <div className="relative">
                <Input
                  id={p.key}
                  type={meta.type ?? 'text'}
                  step="any"
                  value={values[p.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                  disabled={disabled}
                  className={meta.suffix ? 'pr-12' : ''}
                />
                {meta.suffix && (
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                    {meta.suffix}
                  </span>
                )}
              </div>
              {meta.help && <p className="text-xs text-muted-foreground">{meta.help}</p>}
            </div>
          );
        })}
      </div>
    </form>
  );
}
