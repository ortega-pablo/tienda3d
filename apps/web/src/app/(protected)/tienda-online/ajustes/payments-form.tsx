'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  EcommercePaymentsDto,
  EcommercePaymentsInput,
  OnlinePaymentMethod,
  PaymentReadiness,
} from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { useEditMode } from '@/hooks/use-edit-mode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const toForm = (p: EcommercePaymentsDto): EcommercePaymentsInput => ({
  cashEnabled: p.cashEnabled,
  bankTransferEnabled: p.bankTransferEnabled,
  bankTransferInstructions: p.bankTransferInstructions,
  mercadoPagoEnabled: p.mercadoPagoEnabled,
  modoEnabled: p.modoEnabled,
  goCuotasEnabled: p.goCuotasEnabled,
});

const ONLINE: Array<{
  method: OnlinePaymentMethod;
  field: 'mercadoPagoEnabled' | 'modoEnabled' | 'goCuotasEnabled';
  label: string;
  detail: string;
}> = [
  {
    method: 'MERCADOPAGO',
    field: 'mercadoPagoEnabled',
    label: 'Mercado Pago',
    detail: 'Tarjetas y dinero en cuenta, en el checkout de Mercado Pago.',
  },
  {
    method: 'MODO',
    field: 'modoEnabled',
    label: 'MODO',
    detail: 'Desde la app del banco del cliente, sin cargar la tarjeta.',
  },
  {
    method: 'GOCUOTAS',
    field: 'goCuotasEnabled',
    label: 'Go Cuotas',
    detail: 'En cuotas con tarjeta de débito.',
  },
];

const READINESS: Record<
  PaymentReadiness,
  { label: string; variant: 'success' | 'destructive' | 'outline' }
> = {
  ready: { label: 'Credenciales cargadas', variant: 'success' },
  missing: { label: 'Faltan las credenciales', variant: 'destructive' },
  unknown: { label: 'La tienda no respondió', variant: 'outline' },
};

/**
 * Medios de pago de la tienda (F22·2, D19). Pide `ecommerce:payments`, aparte
 * de los demás ajustes. Un medio en línea solo se prende con las credenciales
 * cargadas en la tienda: lo controla también el servidor.
 */
export function PaymentsForm({ initial }: { initial: EcommercePaymentsDto }) {
  const router = useRouter();
  const editMode = useEditMode();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState<EcommercePaymentsInput>(() => toForm(initial));
  const set = <K extends keyof EcommercePaymentsInput>(key: K, value: EcommercePaymentsInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const disabled = !editMode.editing || editMode.saving;

  const save = () =>
    editMode
      .save(
        () =>
          api<EcommercePaymentsDto>('/web-catalog/settings/payments', {
            method: 'PUT',
            body: form,
          }),
        { successMessage: 'Medios de pago guardados' },
      )
      .then((result) => {
        if (result) {
          setSaved(result);
          setForm(toForm(result));
          router.refresh();
        }
      });

  return (
    <section className="space-y-4" aria-labelledby="medios-de-pago">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="medios-de-pago" className="text-2xl font-bold">
            Medios de pago
          </h2>
          <p className="text-muted-foreground">
            Cada medio se prende o se apaga para todo el checkout. Los cambios quedan en la
            auditoría.
          </p>
        </div>
        {editMode.editing ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={editMode.saving}
              onClick={() => editMode.cancel(() => setForm(toForm(saved)))}
            >
              Cancelar
            </Button>
            <Button onClick={save} disabled={editMode.saving}>
              Guardar
            </Button>
          </div>
        ) : (
          <Button onClick={editMode.start}>Editar medios de pago</Button>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Efectivo en el local</CardTitle>
            <CardDescription>
              Solo con retiro por el taller, al precio publicado. Se cobra al retirar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Switch
              checked={form.cashEnabled}
              onCheckedChange={(v) => set('cashEnabled', v)}
              disabled={disabled || (!saved.pickupEnabled && !form.cashEnabled)}
              label="Se acepta efectivo"
            />
            {!saved.pickupEnabled && (
              <p className="text-muted-foreground text-sm">
                Prendé el retiro por el taller para ofrecer efectivo.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transferencia</CardTitle>
            <CardDescription>
              El cobro se confirma a mano desde el pedido, al verlo acreditado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Switch
              checked={form.bankTransferEnabled}
              onCheckedChange={(v) => set('bankTransferEnabled', v)}
              disabled={disabled}
              label="Se acepta transferencia"
            />
            <div className="space-y-1.5">
              <Label htmlFor="aj-transferencia">Datos para transferir</Label>
              <Textarea
                id="aj-transferencia"
                rows={4}
                value={form.bankTransferInstructions}
                onChange={(e) => set('bankTransferInstructions', e.target.value)}
                disabled={disabled}
                placeholder="CBU o alias, titular y CUIT"
                maxLength={4000}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pagos en línea</CardTitle>
            <CardDescription>
              Se pueden prender solo si la tienda tiene las credenciales de cada uno.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {ONLINE.map(({ method, field, label, detail }) => {
              const readiness = saved.readiness[method];
              const canTurnOn = readiness === 'ready' || saved[field];
              return (
                <div
                  key={method}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{label}</p>
                    <p className="text-muted-foreground text-sm">{detail}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={READINESS[readiness].variant}>
                      {READINESS[readiness].label}
                    </Badge>
                    <Switch
                      checked={form[field]}
                      onCheckedChange={(v) => set(field, v)}
                      disabled={disabled || (!canTurnOn && !form[field])}
                      aria-label={`${label}: ${form[field] ? 'prendido' : 'apagado'}`}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
