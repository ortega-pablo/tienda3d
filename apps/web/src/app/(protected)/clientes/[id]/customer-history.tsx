'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatMoney, formatNumber } from '@/lib/format';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

interface QuoteRow {
  id: string;
  code: string;
  type: 'PRODUCT' | 'ADHOC';
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  total: number;
  itemCount: number;
  createdAt: string;
}

interface VolumeRow {
  categoryId: string;
  categoryName: string;
  monthStart: string;
  unitsSold: number;
  committedQty: number | null;
  unfulfilled: boolean;
}

const STATUS_LABEL: Record<QuoteRow['status'], string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
};

const STATUS_COLOR: Record<QuoteRow['status'], string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SENT: 'bg-primary/10 text-primary',
  ACCEPTED: 'bg-success/10 text-success',
  REJECTED: 'bg-destructive/10 text-destructive',
  EXPIRED: 'bg-warning/10 text-warning',
};

export function CustomerHistory({ customerId }: { customerId: string }) {
  const [tab, setTab] = useState<'quotes' | 'volumes'>('quotes');
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
  const [volumes, setVolumes] = useState<VolumeRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<QuoteRow[]>(`/customers/${customerId}/quotes`),
      api<VolumeRow[]>(`/customers/${customerId}/volumes`),
    ])
      .then(([q, v]) => {
        setQuotes(q);
        setVolumes(v);
      })
      .catch((err) => handleApiError(err))
      .finally(() => setLoading(false));
  }, [customerId]);

  const totals = useMemo(() => {
    if (!quotes) return null;
    const accepted = quotes.filter((q) => q.status === 'ACCEPTED');
    return {
      total: quotes.length,
      accepted: accepted.length,
      acceptedAmount: accepted.reduce((acc, q) => acc + q.total, 0),
      acceptanceRate: quotes.length > 0 ? (accepted.length / quotes.length) * 100 : 0,
    };
  }, [quotes]);

  // Agrupar volúmenes por mes para mostrar tabla matriz.
  const volumeMatrix = useMemo(() => {
    if (!volumes) return null;
    const months = new Set<string>();
    const categories = new Map<string, string>();
    const cells = new Map<string, VolumeRow>();
    for (const v of volumes) {
      months.add(v.monthStart);
      categories.set(v.categoryId, v.categoryName);
      cells.set(`${v.categoryId}:${v.monthStart}`, v);
    }
    return {
      months: [...months].sort((a, b) => b.localeCompare(a)),
      categories: [...categories.entries()],
      cells,
    };
  }, [volumes]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>
              Cotizaciones y volúmenes mensuales por categoría asociada.
            </CardDescription>
          </div>
          <div className="flex gap-1 rounded-md border bg-muted/30 p-1 text-sm">
            <button
              onClick={() => setTab('quotes')}
              className={
                tab === 'quotes'
                  ? 'rounded px-3 py-1.5 font-medium bg-secondary text-secondary-foreground'
                  : 'rounded px-3 py-1.5 text-muted-foreground hover:bg-accent'
              }
            >
              Cotizaciones
            </button>
            <button
              onClick={() => setTab('volumes')}
              className={
                tab === 'volumes'
                  ? 'rounded px-3 py-1.5 font-medium bg-secondary text-secondary-foreground'
                  : 'rounded px-3 py-1.5 text-muted-foreground hover:bg-accent'
              }
            >
              Volúmenes mensuales
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" /> Cargando…
          </p>
        )}

        {!loading && tab === 'quotes' && quotes && (
          <div className="space-y-3">
            {totals && totals.total > 0 && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>
                  Total: <strong className="text-foreground">{totals.total}</strong>
                </span>
                <span>
                  Aceptadas:{' '}
                  <strong className="text-foreground">
                    {totals.accepted} ({formatNumber(totals.acceptanceRate, 1)}%)
                  </strong>
                </span>
                <span>
                  Facturado (aceptadas):{' '}
                  <strong className="text-foreground">{formatMoney(totals.acceptedAmount)}</strong>
                </span>
              </div>
            )}
            {quotes.length === 0 ? (
              <p className="rounded-md border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                Sin cotizaciones todavía.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Código</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Items</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 pr-4 font-medium">Fecha</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quotes.map((q) => (
                    <tr key={q.id}>
                      <td className="py-2 pr-4 font-mono">{q.code}</td>
                      <td className="py-2 pr-4">
                        {q.type === 'PRODUCT' ? 'Producto' : 'Ad-hoc'}
                      </td>
                      <td className="py-2 pr-4">{q.itemCount}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[q.status]}`}>
                          {STATUS_LABEL[q.status]}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono">{formatMoney(q.total)}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(q.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/cotizaciones/${q.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {!loading && tab === 'volumes' && volumeMatrix && (
          <div className="space-y-3">
            {volumeMatrix.months.length === 0 ? (
              <p className="rounded-md border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                Sin volúmenes registrados todavía. Cuando se acepten cotizaciones para este
                cliente, las cantidades se imputan acá.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Categoría</th>
                    {volumeMatrix.months.map((m) => (
                      <th key={m} className="py-2 pr-4 font-medium">
                        {new Date(m).toLocaleDateString('es-AR', {
                          month: 'short',
                          year: '2-digit',
                        })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {volumeMatrix.categories.map(([catId, catName]) => (
                    <tr key={catId}>
                      <td className="py-2 pr-4 font-medium">{catName}</td>
                      {volumeMatrix.months.map((m) => {
                        const cell = volumeMatrix.cells.get(`${catId}:${m}`);
                        if (!cell) return <td key={m} className="py-2 pr-4 text-muted-foreground">—</td>;
                        const fulfilled = cell.committedQty == null
                          ? null
                          : cell.unitsSold >= cell.committedQty;
                        const className = fulfilled === null
                          ? 'text-muted-foreground'
                          : fulfilled
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-destructive';
                        return (
                          <td key={m} className={`py-2 pr-4 font-mono ${className}`}>
                            {formatNumber(cell.unitsSold, 0)}
                            {cell.committedQty != null && (
                              <span className="text-muted-foreground">/{cell.committedQty}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
