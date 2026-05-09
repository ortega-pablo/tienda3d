'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatNumber } from '@/lib/format';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { CustomerWithRelations } from '../types';

interface VolumeRow {
  categoryId: string;
  categoryName: string;
  monthStart: string;
  unitsSold: number;
  committedQty: number | null;
  unfulfilled: boolean;
}

/**
 * Card que muestra el progreso del mes en curso para cada commitment con
 * compromiso de volumen. Solo visible para WHOLESALE.
 */
export function CustomerMonthProgress({ customer }: { customer: CustomerWithRelations }) {
  const [volumes, setVolumes] = useState<VolumeRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<VolumeRow[]>(`/customers/${customer.id}/volumes`)
      .then(setVolumes)
      .catch((err) => handleApiError(err))
      .finally(() => setLoading(false));
  }, [customer.id]);

  // Solo mostramos commitments que tienen monthlyCommitmentQty (sino no hay
  // nada que trackear).
  const tracked = customer.categoryCommitments.filter(
    (c) => c.monthlyCommitmentQty != null,
  );
  if (tracked.length === 0) return null;

  // Identificamos el "mes en curso" como el monthStart más reciente que
  // aparece en los volúmenes. Si todavía no hay volúmenes para este mes,
  // mostramos 0 sobre el compromiso.
  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const daysRemaining = daysUntilEndOfMonth(now);

  const getCurrentVolume = (categoryId: string): number => {
    if (!volumes) return 0;
    const match = volumes.find(
      (v) =>
        v.categoryId === categoryId &&
        new Date(v.monthStart).getTime() === currentMonth.getTime(),
    );
    return match?.unitsSold ?? 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compromisos del mes</CardTitle>
        <CardDescription>
          {now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })} ·{' '}
          {daysRemaining} día{daysRemaining === 1 ? '' : 's'} restantes en el mes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" /> Cargando…
          </p>
        )}
        {!loading &&
          tracked.map((c) => {
            const current = getCurrentVolume(c.categoryId);
            const target = c.monthlyCommitmentQty!;
            const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
            const fulfilled = current >= target;
            const onTrack = pct >= ((30 - daysRemaining) / 30) * 100; // heurística simple
            const barColor = c.isWholesaleSuspended
              ? 'bg-destructive'
              : fulfilled
                ? 'bg-emerald-500'
                : onTrack
                  ? 'bg-primary'
                  : 'bg-warning';

            return (
              <div key={c.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    {c.isWholesaleSuspended ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : fulfilled ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : null}
                    <span className="font-medium">{c.categoryName}</span>
                    {c.isWholesaleSuspended && (
                      <span className="text-xs text-destructive">(suspendido)</span>
                    )}
                  </div>
                  <span className="font-mono text-xs">
                    {formatNumber(current, 0)} / {target} unid.
                    {!fulfilled && !c.isWholesaleSuspended && (
                      <span className="ml-1 text-muted-foreground">
                        (faltan {target - current})
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

function daysUntilEndOfMonth(date: Date): number {
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const diff = end.getTime() - date.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}
