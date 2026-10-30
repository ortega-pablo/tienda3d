'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { WebOrderDetailDto, WebOrderFulfillmentChangeInput } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { parseAmount } from '@/lib/format';
import { formatCents } from '../order-labels';

type Step = WebOrderDetailDto['actions']['fulfillment'][number];

const STEP: Record<Step, { label: string; toast: string }> = {
  PREPARING: { label: 'Empezar a preparar', toast: 'El pedido está en preparación.' },
  READY_FOR_PICKUP: { label: 'Listo para retirar', toast: 'El pedido está listo para retirar.' },
  SHIPPED: { label: 'Marcar enviado', toast: 'El pedido está enviado.' },
  DELIVERED: { label: 'Marcar entregado', toast: 'El pedido está entregado.' },
};

/** Monto en pesos escrito a mano → centavos (null si no se entiende). */
function toCents(text: string): number | null {
  const amount = parseAmount(text);
  return amount != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

/**
 * Las acciones que la API habilita para este pedido (§5.6); nada más. Los cobros
 * piden el permiso de pagos (`canPayments`, F22·3).
 */
export function OrderActions({
  order,
  canPayments,
}: {
  order: WebOrderDetailDto;
  canPayments: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [paying, setPaying] = useState<'transfer' | 'cash' | null>(null);
  const [amount, setAmount] = useState('');
  const [operation, setOperation] = useState('');
  const [credited, setCredited] = useState(false);
  const { actions } = order;
  const confirmTransfer = canPayments && actions.confirmTransfer;
  const confirmCash = canPayments && actions.confirmCash;
  const amountCents = toCents(amount);
  const closePaying = () => {
    setPaying(null);
    setAmount('');
    setOperation('');
    setCredited(false);
  };

  const run = async (path: string, body: object, done: string) => {
    setPending(true);
    try {
      await api(`/web-orders/${order.id}/${path}`, { method: 'POST', body });
      toast.success(done);
      setShipping(false);
      setCancelling(false);
      closePaying();
      router.refresh();
    } catch (err) {
      handleApiError(err);
    } finally {
      setPending(false);
    }
  };

  const move = (status: Step) => {
    if (status === 'SHIPPED') return setShipping(true);
    const body: WebOrderFulfillmentChangeInput = { status };
    return run('fulfillment', body, STEP[status].toast);
  };

  if (!confirmTransfer && !confirmCash && actions.fulfillment.length === 0 && !actions.cancel) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {confirmTransfer && (
        <Button onClick={() => setPaying('transfer')} disabled={pending}>
          Confirmar transferencia
        </Button>
      )}
      {confirmCash && (
        <Button onClick={() => setPaying('cash')} disabled={pending}>
          Cobrado en efectivo
        </Button>
      )}
      {actions.fulfillment.map((status, i) => (
        <Button
          key={status}
          variant={i === 0 && !confirmTransfer && !confirmCash ? 'default' : 'outline'}
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
        open={paying !== null}
        onOpenChange={(open) => !open && closePaying()}
        title={paying === 'cash' ? 'Cobrar en efectivo' : 'Confirmar la transferencia'}
        description={
          paying === 'cash'
            ? `Pedí el documento: el pedido se entrega a ${order.customer.name}${order.customer.document ? ` (DNI o CUIT ${order.customer.document})` : ''}.`
            : 'Confirmá solo si la ves acreditada en el homebanking: un comprobante no prueba nada.'
        }
        footer={
          <>
            <Button variant="outline" onClick={closePaying} disabled={pending}>
              Volver
            </Button>
            <Button
              onClick={() =>
                paying === 'cash'
                  ? run('confirm-cash', { amountCents }, 'Cobro en efectivo registrado.')
                  : run(
                      'confirm-transfer',
                      { amountCents, operationNumber: operation.trim() },
                      'Transferencia confirmada.',
                    )
              }
              disabled={
                pending ||
                amountCents === null ||
                (paying === 'transfer' && (operation.trim().length < 3 || !credited))
              }
            >
              {pending && <Spinner size="sm" />}
              {paying === 'cash' ? 'Registrar el cobro' : 'Confirmar pago'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm">
            Total del pedido: <span className="font-medium">{formatCents(order.totalCents)}</span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ped-monto">
              {paying === 'cash' ? 'Monto cobrado ($)' : 'Monto acreditado ($)'}
            </Label>
            <Input
              id="ped-monto"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Lo que recibiste, sin copiar el total"
            />
          </div>
          {paying === 'transfer' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ped-operacion">Número de operación del banco</Label>
                <Input
                  id="ped-operacion"
                  value={operation}
                  onChange={(e) => setOperation(e.target.value)}
                  maxLength={60}
                />
              </div>
              <Checkbox
                id="ped-acreditada"
                checked={credited}
                onChange={(e) => setCredited(e.target.checked)}
                label="La vi acreditada en la cuenta del negocio"
              />
            </>
          )}
        </div>
      </Dialog>

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
