'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

export interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
}
export interface CustomerOption {
  id: string;
  name: string;
  type: 'STANDARD' | 'WHOLESALE' | 'CONSIGNMENT' | 'SPECIAL';
  email: string | null;
  phone: string | null;
  isActive: boolean;
  skipChannelCommission: boolean;
  skipMarketing: boolean;
  skipRegime: boolean;
  skipReinvestment: boolean;
}

interface ItemDraft {
  productId: string;
  quantity: string;
  description: string;
}

interface ItemPreview {
  unitCost: number;
  unitPrice: number;
  unitProfit: number;
  lineTotal: number;
}

const newItem = (productId = ''): ItemDraft => ({
  productId,
  quantity: '1',
  description: '',
});

export function ProductQuoteForm({
  products,
  customers,
  ventaDirectaId,
  efectivoId,
}: {
  products: ProductLite[];
  customers: CustomerOption[];
  /** Id del canal "Venta Directa" — default (con factura). */
  ventaDirectaId: string;
  /** Id del canal "Efectivo" — usado cuando se tilda "sin factura". */
  efectivoId: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string>('');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', notes: '' });
  // Default: sin tildar = con factura = Venta Directa.
  // Tildado = sin factura = canal Efectivo.
  const [withoutInvoice, setWithoutInvoice] = useState(false);
  const channelId = withoutInvoice ? efectivoId : ventaDirectaId;
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([newItem(products[0]?.id ?? '')]);
  const [previews, setPreviews] = useState<Record<number, ItemPreview | 'loading' | 'error'>>({});
  const [saving, setSaving] = useState(false);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  // Cuando se selecciona un cliente: autocomplete + reset de previews
  // para forzar recálculo con el profile.
  const onCustomerChange = (id: string) => {
    setCustomerId(id);
    setPreviews({});
    const c = customers.find((x) => x.id === id);
    if (c) {
      setCustomer({
        name: c.name,
        email: c.email ?? '',
        phone: c.phone ?? '',
        notes: '',
      });
    } else {
      // Limpio (vuelve a walk-in).
      setCustomer({ name: '', email: '', phone: '', notes: '' });
    }
  };

  // Cuando cambia el canal (toggle "sin factura"), invalidar previews
  // existentes. Los items que ya tenían preview se vuelven a calcular en
  // un useEffect aparte para no bloquear el toggle.
  useEffect(() => {
    setPreviews((prev) => {
      // Marcamos como 'loading' los que ya tenían resultado para que el UI
      // muestre el spinner mientras refresca.
      const next: Record<number, ItemPreview | 'loading' | 'error'> = {};
      for (const [idx, val] of Object.entries(prev)) {
        if (val && typeof val === 'object') next[Number(idx)] = 'loading';
      }
      return next;
    });
    // Re-fetch en paralelo. Disparamos sin await para no bloquear.
    Object.keys(previews).forEach((k) => {
      const idx = Number(k);
      const prev = previews[idx];
      if (prev && typeof prev === 'object') {
        void previewItem(idx);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withoutInvoice]);

  const setItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  };

  const previewItem = async (idx: number) => {
    const item = items[idx];
    if (!item || !item.productId) return;
    setPreviews((p) => ({ ...p, [idx]: 'loading' }));
    try {
      const result = await api<ItemPreview>('/quotes/preview-item', {
        method: 'POST',
        body: {
          channelId,
          customerId: customerId || null,
          item: {
            type: 'PRODUCT',
            productId: item.productId,
            quantity: Number(item.quantity || '1'),
            description: item.description || undefined,
          },
        },
      });
      setPreviews((p) => ({ ...p, [idx]: result }));
    } catch {
      setPreviews((p) => ({ ...p, [idx]: 'error' }));
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const created = await api<{ id: string }>('/quotes', {
        method: 'POST',
        body: {
          customerId: customerId || null,
          customerName: customer.name,
          customerEmail: customer.email || null,
          customerPhone: customer.phone || null,
          customerNotes: customer.notes || null,
          channelId,
          // El motor sigue usando `withInvoice` para metadata del Quote;
          // el flag visible es su negación.
          withInvoice: !withoutInvoice,
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          notes: notes || null,
          discount: Number(discount || '0'),
          items: items.map((i) => ({
            type: 'PRODUCT',
            productId: i.productId,
            quantity: Number(i.quantity || '1'),
            description: i.description || undefined,
          })),
        },
      });
      toast.success('Cotización creada.');
      router.replace(`/cotizaciones/${created.id}`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const subtotal = Object.values(previews).reduce<number>(
    (acc, p) => (p && typeof p === 'object' ? acc + p.lineTotal : acc),
    0,
  );
  const total = Math.max(subtotal - Number(discount || '0'), 0);

  const isFormValid =
    customer.name.trim().length > 0 &&
    items.length > 0 &&
    items.every((i) => i.productId && Number(i.quantity || '0') > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
            {selectedCustomer && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {selectedCustomer.type === 'WHOLESALE'
                    ? 'Mayorista'
                    : selectedCustomer.type === 'CONSIGNMENT'
                      ? 'Consignación'
                      : selectedCustomer.type === 'SPECIAL'
                        ? 'Especial'
                        : 'Estándar'}
                </span>
                {selectedCustomer.skipChannelCommission && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin comisión
                  </span>
                )}
                {selectedCustomer.skipMarketing && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin marketing
                  </span>
                )}
                {selectedCustomer.skipRegime && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin régimen
                  </span>
                )}
                {selectedCustomer.skipReinvestment && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin reinversión
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {customers.length > 0 && (
              <div className="sm:col-span-2">
                <Field label="Cliente registrado (opcional)">
                  <select
                    value={customerId}
                    onChange={(e) => onCustomerChange(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                  >
                    <option value="">— Sin cliente registrado (walk-in) —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.type === 'WHOLESALE'
                          ? 'Mayorista'
                          : c.type === 'CONSIGNMENT'
                            ? 'Consignación'
                            : c.type === 'SPECIAL'
                              ? 'Especial'
                              : 'Estándar'})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Si elegís uno, se autocompletan datos y aplican sus reglas de pricing al
                    motor.
                  </p>
                </Field>
              </div>
            )}
            <Field label="Cliente" required>
              <Input
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                disabled={!!selectedCustomer}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
            </Field>
            <Field label="Válida hasta">
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </Field>
            <Field label="Descuento ($)">
              <Input
                type="number"
                step="any"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 rounded-md border bg-muted/20 p-3">
              <Checkbox
                label="Operación sin factura"
                checked={withoutInvoice}
                onChange={(e) => setWithoutInvoice(e.target.checked)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {withoutInvoice
                  ? 'Aplica escalas del canal Efectivo (sin IVA ni régimen).'
                  : 'Aplica escalas de Venta Directa (con régimen unificado).'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notas">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Productos</CardTitle>
              <CardDescription>
                Una línea por producto. El color de cada pieza se elige al crear la orden de
                fabricación, no en la cotización.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setItems((arr) => [...arr, newItem(products[0]?.id ?? '')])}
            >
              <Plus className="h-4 w-4" /> Agregar producto
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, idx) => {
              return (
                <div key={idx} className="rounded-md border p-3">
                  <div className="grid gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-7">
                      <Label className="text-xs" required>
                        Producto
                      </Label>
                      <select
                        value={item.productId}
                        onChange={(e) => setItem(idx, { productId: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs" required>
                        Cantidad
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setItem(idx, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Label className="text-xs">Detalle (override)</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => previewItem(idx)}>
                        Calcular precio
                      </Button>
                      {items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <PreviewLine result={previews[idx]} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={!isFormValid || saving}>
            {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {saving ? 'Guardando…' : 'Crear cotización'}
          </Button>
        </div>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
          <CardDescription>
            {withoutInvoice ? 'Aplicado al canal Efectivo.' : 'Aplicado a Venta Directa.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Productos</span>
            <span>{items.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal estimado</span>
            <span className="font-mono">{formatMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Descuento</span>
            <span className="font-mono">- {formatMoney(Number(discount || '0'))}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium">Total</span>
            <span className="font-mono font-semibold">{formatMoney(total)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label required={required}>{label}</Label>
      {children}
    </div>
  );
}

function PreviewLine({ result }: { result: ItemPreview | 'loading' | 'error' | undefined }) {
  if (!result) return <span className="text-xs text-muted-foreground">Sin calcular</span>;
  if (result === 'loading') return <span className="text-xs text-muted-foreground">Calculando…</span>;
  if (result === 'error') return <span className="text-xs text-destructive">Error al calcular</span>;
  return (
    <div className="text-right text-sm">
      <div className="font-mono font-semibold">{formatMoney(result.lineTotal)}</div>
      <div className="text-xs text-muted-foreground">unit. {formatMoney(result.unitPrice)}</div>
      <div
        className="text-xs text-emerald-700 dark:text-emerald-300"
        title="Ganancia de bolsillo por unidad."
      >
        ganancia {formatMoney(result.unitProfit)}
      </div>
    </div>
  );
}
