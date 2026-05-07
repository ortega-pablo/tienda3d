'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/confirm-provider';
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

const TRANSITIONS: Record<
  ProductionStatus,
  Array<{ to: ProductionStatus; label: string; primary?: boolean }>
> = {
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

const STATUS_TOAST: Record<ProductionStatus, string> = {
  PLANNED: 'Orden vuelta a planificada.',
  IN_PROGRESS: 'Producción iniciada.',
  DONE: 'Orden completada. Stock descontado.',
  CANCELLED: 'Orden cancelada.',
};

export function ProductionActions({ order }: { order: ProductionDto }) {
  const can = useHasPermission();
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);

  if (!can('production:execute')) return null;
  const transitions = TRANSITIONS[order.status] ?? [];

  const setStatus = async (status: ProductionStatus) => {
    if (status === 'DONE') {
      const ok = await confirm({
        title: '¿Marcar esta orden como completada?',
        description: 'Se descontará el stock de todos los insumos consumidos.',
        confirmLabel: 'Completar',
        variant: 'destructive',
      });
      if (!ok) return;
    } else if (status === 'CANCELLED') {
      const ok = await confirm({
        title: '¿Cancelar la orden?',
        confirmLabel: 'Cancelar orden',
        cancelLabel: 'Volver',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    setPending(true);
    try {
      await api(`/productions/${order.id}/status`, { method: 'PATCH', body: { status } });
      toast.success(STATUS_TOAST[status]);
      router.refresh();
    } catch (err) {
      handleApiError(err);
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
            {pending && <Spinner size="sm" />}
            {t.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
