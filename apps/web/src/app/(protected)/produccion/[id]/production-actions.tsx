'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/components/user-provider';

export type ProductionStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface ProductionDto {
  id: string;
  code: string;
  productId: string;
  productName: string;
  quantity: number;
  status: ProductionStatus;
  totalCostSnapshot: number;
  filamentOverrides: Record<string, string> | null;
  startedAt: string | null;
  finishedAt: string | null;
  notes: string | null;
  createdById: string;
  createdAt: string;
  consumption: Array<{
    materialId: string;
    materialName: string;
    unit: string;
    recipeQty: number;
    wastePct: number;
    totalQty: number;
  }>;
}

const TRANSITIONS: Record<ProductionStatus, Array<{ to: ProductionStatus; label: string; primary?: boolean }>> = {
  PLANNED: [
    { to: 'IN_PROGRESS', label: 'Iniciar producción', primary: true },
    { to: 'DONE', label: 'Marcar completada (descuenta stock)' },
    { to: 'CANCELLED', label: 'Cancelar' },
  ],
  IN_PROGRESS: [
    { to: 'DONE', label: 'Completada (descuenta stock)', primary: true },
    { to: 'CANCELLED', label: 'Cancelar' },
  ],
  DONE: [],
  CANCELLED: [],
};

export function ProductionActions({ order }: { order: ProductionDto }) {
  const can = useHasPermission();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!can('production:execute')) return null;
  const transitions = TRANSITIONS[order.status] ?? [];

  const setStatus = async (status: ProductionStatus) => {
    if (status === 'DONE') {
      const ok = confirm(
        '¿Marcar esta orden como completada? Se descontará el stock de todos los insumos consumidos.',
      );
      if (!ok) return;
    }
    setError(null);
    setPending(true);
    try {
      await api(`/productions/${order.id}/status`, { method: 'PATCH', body: { status } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <Button
            key={t.to}
            variant={t.primary ? 'default' : 'outline'}
            onClick={() => setStatus(t.to)}
            disabled={pending}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
