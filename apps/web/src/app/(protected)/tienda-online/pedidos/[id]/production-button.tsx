'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Factory } from 'lucide-react';
import { toast } from 'sonner';
import type { WebOrderDetailDto, WebOrderProductionPlanDto } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { useHasPermission } from '@/components/user-provider';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

/**
 * Genera la orden de producción de un ítem con los colores que eligió el
 * cliente (F14·7). Antes muestra qué color lleva cada pieza.
 */
export function ProductionButton({ orderId, itemId }: { orderId: string; itemId: string }) {
  const can = useHasPermission();
  const router = useRouter();
  const [plan, setPlan] = useState<WebOrderProductionPlanDto | null>(null);
  const [quantity, setQuantity] = useState('');
  const [pending, setPending] = useState(false);
  if (!can('production:execute')) return null;

  const open = async () => {
    setPending(true);
    try {
      const loaded = await api<WebOrderProductionPlanDto>(
        `/web-orders/${orderId}/items/${itemId}/production-plan`,
      );
      setPlan(loaded);
      setQuantity(String(loaded.suggestedQuantity));
    } catch (err) {
      handleApiError(err);
    } finally {
      setPending(false);
    }
  };

  const generate = async () => {
    setPending(true);
    try {
      const order = await api<WebOrderDetailDto>(
        `/web-orders/${orderId}/items/${itemId}/production-order`,
        { method: 'POST', body: { quantity: Number(quantity) } },
      );
      const code = order.items.find((i) => i.id === itemId)?.productionOrderCode;
      toast.success(`Orden de producción ${code ?? ''} generada.`);
      setPlan(null);
      router.refresh();
    } catch (err) {
      handleApiError(err);
    } finally {
      setPending(false);
    }
  };

  const valid = /^\d+$/.test(quantity) && Number(quantity) >= 1 && Number(quantity) <= 999;

  return (
    <>
      <Button variant="outline" size="sm" onClick={open} disabled={pending}>
        {pending && !plan ? <Spinner size="sm" /> : <Factory className="h-4 w-4" />}
        Generar orden de producción
      </Button>
      <Dialog
        open={!!plan}
        onOpenChange={(o) => !o && setPlan(null)}
        title="Generar orden de producción"
        description={plan ? `${plan.productName} · ${plan.variantLabel}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setPlan(null)} disabled={pending}>
              Volver
            </Button>
            <Button onClick={generate} disabled={pending || !valid || !!plan?.missing.length}>
              {pending && <Spinner size="sm" />}
              Generar
            </Button>
          </>
        }
      >
        {plan && (
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="op-cantidad">Unidades a fabricar</Label>
              <Input
                id="op-cantidad"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-28"
              />
              {plan.suggestedQuantity < plan.quantity && (
                <p className="text-xs text-muted-foreground">
                  El pedido es de {plan.quantity}; {plan.quantity - plan.suggestedQuantity} sale(n)
                  del stock.
                </p>
              )}
            </div>
            <div>
              <p className="mb-1.5 font-medium">Color de cada pieza</p>
              <ul className="space-y-1">
                {plan.pieces.map((p) => (
                  <li key={p.pieceId} className="flex items-center justify-between gap-3">
                    <span>{p.pieceName}</span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {p.colorHex && (
                        <span
                          aria-hidden
                          className="inline-block h-3.5 w-3.5 rounded-full border"
                          style={{ backgroundColor: p.colorHex }}
                        />
                      )}
                      {p.colorName ?? 'Sin color a elegir'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {plan.missing.length > 0 && (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-3">
                La publicación no define el color de {plan.missing.join(', ')}. Generá la orden
                desde Producción.
              </p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
