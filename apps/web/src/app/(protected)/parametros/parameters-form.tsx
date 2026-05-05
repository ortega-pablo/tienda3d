'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  currency: { label: 'Moneda', type: 'text', help: 'Código ISO 4217.' },
};

export function ParametersForm({ initial }: { initial: ParameterDto[] }) {
  const can = useHasPermission();
  const canWrite = can('parameter:write');
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((p) => [p.key, p.value])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api('/parameters', { method: 'PATCH', body: { values } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {initial.map((p) => {
          const meta = META[p.key] ?? { label: p.key };
          return (
            <div key={p.key} className="space-y-1.5">
              <Label htmlFor={p.key}>{meta.label}</Label>
              <div className="relative">
                <Input
                  id={p.key}
                  type={meta.type ?? 'text'}
                  step="any"
                  value={values[p.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                  disabled={!canWrite}
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

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {canWrite && (
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      )}
    </form>
  );
}
