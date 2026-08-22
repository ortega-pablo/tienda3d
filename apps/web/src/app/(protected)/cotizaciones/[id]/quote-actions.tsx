'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/confirm-provider';
import { useHasPermission } from '@/components/user-provider';
import type { QuoteDto } from '@tienda3d/shared';

/**
 * Los DTO de cotización vienen de `@tienda3d/shared`, la MISMA definición que
 * usa la API. Antes este archivo re-declaraba a mano ~90 líneas de tipos
 * (QuoteDto, QuoteItemDto y un subset del desglose): agregar un campo en el
 * backend seguía compilando acá y el campo simplemente no se pintaba.
 *
 * El parámetro de fecha queda en su default (`string`): por JSON las fechas
 * llegan como ISO, no como objetos Date.
 */
export type {
  QuoteDto,
  QuoteItemDto,
  QuoteItemPricingBreakdown,
  AdhocItemPayload,
} from '@tienda3d/shared';

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

const STATUS_TOAST: Record<QuoteDto['status'], string> = {
  DRAFT: 'Cotización vuelta a borrador.',
  SENT: 'Cotización marcada como enviada.',
  ACCEPTED: 'Cotización aceptada.',
  REJECTED: 'Cotización rechazada.',
  EXPIRED: 'Cotización marcada como vencida.',
};

export function QuoteActions({ quote }: { quote: QuoteDto }) {
  const can = useHasPermission();
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);

  const transitions = TRANSITIONS[quote.status] ?? [];

  const setStatus = async (status: QuoteDto['status']) => {
    setPending(true);
    try {
      await api(`/quotes/${quote.id}/status`, { method: 'PATCH', body: { status } });
      toast.success(STATUS_TOAST[status]);
      router.refresh();
    } catch (err) {
      handleApiError(err);
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: '¿Eliminar esta cotización?',
      description: 'Solo borradores pueden eliminarse.',
      confirmLabel: 'Eliminar',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/quotes/${quote.id}`, { method: 'DELETE' });
      toast.success('Cotización eliminada.');
      router.replace('/cotizaciones');
    } catch (err) {
      handleApiError(err);
    }
  };

  const downloadPdf = () => {
    window.open(`/api/quotes/${quote.id}/pdf`, '_blank');
  };

  // "Usar como base": rutea al form de alta correcto según el formato de la
  // cotización y precarga sus valores vía `?from`.
  const reuse = () => {
    const isKeychain = quote.items.some((i) => i.adhocPayload?.templateKind === 'KEYCHAIN');
    const base =
      quote.type === 'PRODUCT'
        ? '/cotizaciones/nueva-catalogo'
        : isKeychain
          ? '/cotizaciones/nueva-llaveros'
          : '/cotizaciones/nueva-a-medida';
    router.push(`${base}?from=${quote.id}`);
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
        {can('quote:create') && (
          <Button variant="outline" onClick={reuse}>
            <Copy className="h-4 w-4" />
            Usar como base
          </Button>
        )}
        {/* Cambiar el estado exige `quote:create` en el backend: mover a ACCEPTED
            imputa volúmenes mensuales. Un rol de solo lectura no ve estos botones. */}
        {can('quote:create') &&
          transitions.map((t) => (
            <Button
              key={t.to}
              variant={t.to === 'ACCEPTED' ? 'default' : 'outline'}
              onClick={() => setStatus(t.to)}
              disabled={pending}
            >
              {pending && <Spinner size="sm" />}
              {t.label}
            </Button>
          ))}
        {can('quote:create') && quote.status === 'DRAFT' && (
          <Button variant="ghost" onClick={remove} disabled={pending}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
