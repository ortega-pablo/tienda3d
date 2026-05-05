'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/components/user-provider';

export interface QuoteDto {
  id: string;
  code: string;
  type: 'PRODUCT' | 'ADHOC';
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  channelId: string | null;
  channelName: string | null;
  withInvoice: boolean;
  subtotal: number;
  discount: number;
  total: number;
  validUntil: string | null;
  notes: string | null;
  itemCount: number;
  createdAt: string;
  items: Array<{
    id: string;
    productId: string | null;
    description: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

const TRANSITIONS: Record<QuoteDto['status'], Array<{ to: QuoteDto['status']; label: string }>> = {
  DRAFT: [
    { to: 'SENT', label: 'Marcar como enviada' },
    { to: 'REJECTED', label: 'Marcar como rechazada' },
    { to: 'EXPIRED', label: 'Marcar como vencida' },
  ],
  SENT: [
    { to: 'ACCEPTED', label: 'Aceptada' },
    { to: 'REJECTED', label: 'Rechazada' },
    { to: 'EXPIRED', label: 'Vencida' },
    { to: 'DRAFT', label: 'Volver a borrador' },
  ],
  ACCEPTED: [],
  REJECTED: [{ to: 'DRAFT', label: 'Volver a borrador' }],
  EXPIRED: [{ to: 'DRAFT', label: 'Volver a borrador' }],
};

export function QuoteActions({ quote }: { quote: QuoteDto }) {
  const can = useHasPermission();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transitions = TRANSITIONS[quote.status] ?? [];

  const setStatus = async (status: QuoteDto['status']) => {
    setError(null);
    setPending(true);
    try {
      await api(`/quotes/${quote.id}/status`, { method: 'PATCH', body: { status } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado');
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!confirm('¿Eliminar esta cotización? Solo borradores pueden eliminarse.')) return;
    try {
      await api(`/quotes/${quote.id}`, { method: 'DELETE' });
      router.replace('/cotizaciones');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    }
  };

  const downloadPdf = () => {
    window.open(`/api/quotes/${quote.id}/pdf`, '_blank');
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {can('quote:export') && (
          <Button variant="outline" onClick={downloadPdf}>
            <Download className="h-4 w-4" />
            PDF
          </Button>
        )}
        {can('quote:read') &&
          transitions.map((t) => (
            <Button
              key={t.to}
              variant={t.to === 'ACCEPTED' ? 'default' : 'outline'}
              onClick={() => setStatus(t.to)}
              disabled={pending}
            >
              {t.label}
            </Button>
          ))}
        {can('quote:create') && quote.status === 'DRAFT' && (
          <Button variant="ghost" onClick={remove} disabled={pending}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
