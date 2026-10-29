'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EcommerceSettingsDto, EcommerceSettingsInput } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { useEditMode } from '@/hooks/use-edit-mode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Form = Omit<EcommerceSettingsInput, 'shippingFlatRate' | 'freeShippingFrom'> & {
  /** Texto del input: vacío = no se ofrece. */
  shippingFlatRate: string;
  freeShippingFrom: string;
};

const toForm = (s: EcommerceSettingsDto): Form => ({
  shippingFlatRate: s.shippingFlatRate == null ? '' : String(s.shippingFlatRate),
  freeShippingFrom: s.freeShippingFrom == null ? '' : String(s.freeShippingFrom),
  pickupEnabled: s.pickupEnabled,
  pickupInstructions: s.pickupInstructions,
  notificationEmail: s.notificationEmail,
});

/**
 * Monto como lo escribe alguien en Argentina: "4.500" son cuatro mil
 * quinientos, "4.500,50" lleva decimales; también acepta "4500.50". Vacío → null.
 */
function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s|\$/g, '');
  if (!t) return null;
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return Number(t);
}

export function SettingsForm({ initial }: { initial: EcommerceSettingsDto }) {
  const router = useRouter();
  const editMode = useEditMode();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const disabled = !editMode.editing || editMode.saving;

  const save = () =>
    editMode
      .save(
        () =>
          api<EcommerceSettingsDto>('/web-catalog/settings', {
            method: 'PUT',
            body: {
              ...form,
              shippingFlatRate: parseAmount(form.shippingFlatRate),
              freeShippingFrom: parseAmount(form.freeShippingFrom),
            },
          }),
        { successMessage: 'Ajustes de la tienda guardados' },
      )
      .then((result) => {
        if (result) {
          setSaved(result);
          setForm(toForm(result));
          router.refresh();
        }
      });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Ajustes de la tienda</h1>
          <p className="text-muted-foreground">
            Condiciones de venta que muestra el checkout. Cambian sin tocar el sitio.
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
          <Button onClick={editMode.start}>Editar</Button>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Envío</CardTitle>
            <CardDescription>
              Tarifa plana a todo el país. Vacío: no se ofrece envío.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="aj-envio">Costo del envío ($)</Label>
              <Input
                id="aj-envio"
                inputMode="decimal"
                value={form.shippingFlatRate}
                onChange={(e) => set('shippingFlatRate', e.target.value)}
                disabled={disabled}
                placeholder="Sin envío"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aj-gratis">Envío gratis desde ($)</Label>
              <Input
                id="aj-gratis"
                inputMode="decimal"
                value={form.freeShippingFrom}
                onChange={(e) => set('freeShippingFrom', e.target.value)}
                disabled={disabled}
                placeholder="Nunca"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Retiro por el taller</CardTitle>
            <CardDescription>La tienda tiene que ofrecer retiro o envío.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Switch
              checked={form.pickupEnabled}
              onCheckedChange={(v) => set('pickupEnabled', v)}
              disabled={disabled}
              label="Se puede retirar"
            />
            <div className="space-y-1.5">
              <Label htmlFor="aj-retiro">Indicaciones para retirar</Label>
              <Textarea
                id="aj-retiro"
                rows={3}
                value={form.pickupInstructions}
                onChange={(e) => set('pickupInstructions', e.target.value)}
                disabled={disabled}
                placeholder="Dirección, días y horarios"
                maxLength={2000}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avisos de pedidos</CardTitle>
            <CardDescription>Adónde llega el mail de cada pedido nuevo.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="aj-email">Email</Label>
              <Input
                id="aj-email"
                type="email"
                value={form.notificationEmail}
                onChange={(e) => set('notificationEmail', e.target.value)}
                disabled={disabled}
                placeholder="pedidos@tiendaplastik.com"
                maxLength={254}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
