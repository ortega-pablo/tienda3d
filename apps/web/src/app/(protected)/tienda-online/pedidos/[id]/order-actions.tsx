'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { WebOrderDetailDto, WebOrderFulfillmentChangeInput } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { useConfirm } from '@/components/confirm-provider';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatCents } from '../order-labels';

type Step = WebOrderDetailDto['actions']['fulfillment'][number];

const STEP: Record<Step, { label: string; toast: string }> = {
  PREPARING: { label: 'Empezar a preparar', toast: 'El pedido está en preparación.' },
  READY_FOR_PICKUP: { label: 'Listo para retirar', toast: 'El pedido está listo para retirar.' },
  SHIPPED: { label: 'Marcar enviado', toast: 'El pedido está enviado.' },
  DELIVERED: { label: 'Marcar entregado', toast: 'El pedido está entregado.' },
};

/** Las acciones que la API habilita para este pedido (§5.6); nada más. */
export function OrderActions({ order }: { order: WebOrderDetailDto }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const { actions } = order;

  const run = async (path: string, body: object, done: string) => {
    setPending(true);
    try {
      await api(`/web-orders/${order.id}/${path}`, { method: 'POST', body });
      toast.success(done);
      setShipping(false);
      setCancelling(false);
      router.refresh();
    } catch (err) {
      handleApiError(err);
    } finally {
      setPending(false);
    }
  };

  const confirmTransfer = async () => {
    const ok = await confirm({
      title: '¿Confirmar la transferencia?',
      description: `Revisá que el comprobante sea por ${formatCents(order.totalCents)}. El pedido queda pagado y se puede empezar a preparar.`,
      confirmLabel: 'Confirmar pago',
    });
    if (ok) await run('confirm-transfer', {}, 'Transferencia confirmada.');
  };

  const move = (status: Step) => {
    if (status === 'SHIPPED') return setShipping(true);
    const body: WebOrderFulfillmentChangeInput = { status };
    return run('fulfillment', body, STEP[status].toast);
  };

  if (!actions.confirmTransfer && actions.fulfillment.length === 0 && !actions.cancel) return null;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {actions.confirmTransfer && (
        <Button onClick={confirmTransfer} disabled={pending}>
          {pending && <Spinner size="sm" />}
          Confirmar transferencia
        </Button>
      )}
      {actions.fulfillment.map((status, i) => (
        <Button
          key={status}
          variant={i === 0 && !actions.confirmTransfer ? 'default' : 'outline'}
          onClick={() => move(status)}
          disabled={pending}
        >
          {pending && <Spinner size="sm" />}
          {status === 'PREPARING' && order.fulfillmentStatus !== 'RECEIVED'
            ? 'Volver a preparación'
            : STEP[status].label}
        </Button>
      ))}
      {actions.cancel && (
        <Button variant="outline" onClick={() => setCancelling(true)} disabled={pending}>
          Cancelar pedido
        </Button>
      )}

      <Dialog
        open={shipping}
        onOpenChange={setShipping}
        title="Marcar enviado"
        description="El cliente ve el código de seguimiento en su compra."
        footer={
          <>
            <Button variant="outline" onClick={() => setShipping(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              onClick={() =>
                run(
                  'fulfillment',
                  { status: 'SHIPPED', trackingCode: trackingCode.trim() || undefined },
                  STEP.SHIPPED.toast,
                )
              }
              disabled={pending}
            >
              Marcar enviado
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="ped-seguimiento">Código de seguimiento (opcional)</Label>
          <Input
            id="ped-seguimiento"
            value={trackingCode}
            onChange={(e) => setTrackingCode(e.target.value)}
            maxLength={120}
          />
        </div>
      </Dialog>

      <Dialog
        open={cancelling}
        onOpenChange={(open) => {
          setCancelling(open);
          if (!open) setReason('');
        }}
        title="Cancelar el pedido"
        description={
          order.paymentStatus === 'APPROVED'
            ? 'Lo reservado vuelve al stock. El pedido ya está pagado: el reembolso se hace aparte.'
            : 'Lo reservado vuelve al stock.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelling(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => run('cancel', { reason: reason.trim() }, 'Pedido cancelado.')}
              disabled={pending || reason.trim().length < 3}
            >
              Cancelar pedido
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="ped-motivo">Motivo</Label>
          <Textarea
            id="ped-motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Por ejemplo: no llegó la transferencia."
          />
        </div>
      </Dialog>
    </div>
  );
}
