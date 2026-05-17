'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2, Zap } from 'lucide-react';
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

export interface ChannelLite {
  id: string;
  name: string;
  isActive: boolean;
}
export interface FilamentLite {
  id: string;
  name: string;
}
export interface CustomerOption {
  id: string;
  name: string;
  type: 'STANDARD' | 'WHOLESALE' | 'CONSIGNMENT' | 'SPECIAL';
  email: string | null;
  phone: string | null;
  isActive: boolean;
  defaultChannelId: string | null;
  skipChannelCommission: boolean;
  skipMarketing: boolean;
  skipRegime: boolean;
  skipReinvestment: boolean;
}

export interface MaterialLite {
  id: string;
  name: string;
  type: 'FILAMENT' | 'SHEET' | 'PACKAGING' | 'HARDWARE' | 'OTHER';
  unit: string;
  isActive: boolean;
}

interface PieceDraft {
  name: string;
  grams: string;
  printMinutes: string;
  filamentId: string;
}
interface MaterialDraft {
  materialId: string;
  quantity: string;
}

interface Preview {
  unitCost: number;
  unitPrice: number;
  unitProfit: number;
  lineTotal: number;
  designSurcharge: number;
}

export function RapidQuoteForm({
  channels,
  filaments,
  nonFilaments,
  customers,
}: {
  channels: ChannelLite[];
  filaments: FilamentLite[];
  nonFilaments: MaterialLite[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', notes: '' });
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const onCustomerChange = (id: string) => {
    setCustomerId(id);
    setPreview(null);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setCustomer({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', notes: '' });
      if (c.defaultChannelId) setChannelId(c.defaultChannelId);
    } else {
      setCustomer({ name: '', email: '', phone: '', notes: '' });
    }
  };
  const [withInvoice, setWithInvoice] = useState(false);
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');

  const [description, setDescription] = useState('Pieza a medida');
  const [quantity, setQuantity] = useState('1');
  const [pieces, setPieces] = useState<PieceDraft[]>([
    { name: 'Pieza', grams: '', printMinutes: '', filamentId: filaments[0]?.id ?? '' },
  ]);
  const [materials, setMaterials] = useState<MaterialDraft[]>([]);
  const [assemblyMinutes, setAssemblyMinutes] = useState('0');
  const [managementMinutes, setManagementMinutes] = useState('0');
  const [designMinutes, setDesignMinutes] = useState('0');

  const [preview, setPreview] = useState<Preview | 'loading' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);

  const buildItem = () => ({
    type: 'ADHOC' as const,
    description: description || 'Pieza a medida',
    quantity: Number(quantity || '1'),
    payload: {
      pieces: pieces
        .filter((p) => p.filamentId)
        .map((p) => ({
          name: p.name,
          grams: Number(p.grams || '0'),
          printMinutes: Number(p.printMinutes || '0'),
          filamentId: p.filamentId,
        })),
      materials: materials
        .filter((m) => m.materialId)
        .map((m) => ({ materialId: m.materialId, quantity: Number(m.quantity || '1') })),
      assemblyMinutes: Number(assemblyMinutes || '0'),
      managementMinutes: Number(managementMinutes || '0'),
      designMinutes: Number(designMinutes || '0'),
    },
  });

  const calc = async () => {
    setPreview('loading');
    try {
      const result = await api<Preview>('/quotes/preview-item', {
        method: 'POST',
        body: {
          channelId: channelId || null,
          customerId: customerId || null,
          item: buildItem(),
        },
      });
      setPreview(result);
    } catch (err) {
      setPreview('error');
      handleApiError(err, { fallback: 'Error al calcular' });
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
          channelId: channelId || null,
          withInvoice,
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          notes: notes || null,
          discount: Number(discount || '0'),
          items: [buildItem()],
        },
      });
      toast.success('Cotización a medida creada.');
      router.replace(`/cotizaciones/${created.id}`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const setPiece = (idx: number, patch: Partial<PieceDraft>) => {
    setPieces((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  };
  const setMaterial = (idx: number, patch: Partial<MaterialDraft>) => {
    setMaterials((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  };

  const lineTotal = preview && typeof preview === 'object' ? preview.lineTotal : 0;
  const total = Math.max(lineTotal - Number(discount || '0'), 0);

  const isFormValid =
    customer.name.trim().length > 0 &&
    Number(quantity || '0') > 0 &&
    description.trim().length > 0 &&
    pieces.some((p) => p.filamentId && Number(p.grams || '0') > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Cliente y canal</CardTitle>
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
                        {c.name}
                      </option>
                    ))}
                  </select>
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
            <Field label="Canal">
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                <option value="">— sin canal —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
            <div className="sm:col-span-2">
              <Checkbox
                label="Operación con factura"
                checked={withInvoice}
                onChange={(e) => setWithInvoice(e.target.checked)}
              />
            </div>
            <div className="sm:col-span-2">
              <Field label="Notas">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" /> Pieza / servicio a cotizar
            </CardTitle>
            <CardDescription>
              Una pieza con uno o varios componentes impresos. Para servicios, dejá las piezas
              vacías y completá solo los minutos de mano de obra.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-9">
                <Field label="Descripción" required>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Llavero personalizado"
                  />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Cantidad" required>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Componentes impresos</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPieces((arr) => [
                      ...arr,
                      { name: 'Pieza', grams: '', printMinutes: '', filamentId: filaments[0]?.id ?? '' },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" /> Componente
                </Button>
              </div>
              {pieces.map((p, idx) => (
                <div key={idx} className="mb-2 grid gap-2 rounded border p-2 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <Label className="text-xs">Nombre</Label>
                    <Input value={p.name} onChange={(e) => setPiece(idx, { name: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs" required>
                      Gramos
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      value={p.grams}
                      onChange={(e) => setPiece(idx, { grams: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Min impr.</Label>
                    <Input
                      type="number"
                      step="any"
                      value={p.printMinutes}
                      onChange={(e) => setPiece(idx, { printMinutes: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Label className="text-xs" required>
                      Filamento
                    </Label>
                    <select
                      value={p.filamentId}
                      onChange={(e) => setPiece(idx, { filamentId: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    >
                      {filaments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end justify-end sm:col-span-1">
                    {pieces.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPieces((arr) => arr.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Insumos extra</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMaterials((arr) => [
                      ...arr,
                      { materialId: nonFilaments[0]?.id ?? '', quantity: '1' },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" /> Insumo
                </Button>
              </div>
              {materials.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin insumos extra.</p>
              )}
              {materials.map((m, idx) => (
                <div key={idx} className="mb-2 grid gap-2 rounded border p-2 sm:grid-cols-12">
                  <div className="sm:col-span-7">
                    <Label className="text-xs" required>
                      Insumo
                    </Label>
                    <select
                      value={m.materialId}
                      onChange={(e) => setMaterial(idx, { materialId: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    >
                      {nonFilaments.map((mt) => (
                        <option key={mt.id} value={mt.id}>
                          {mt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <Label className="text-xs" required>
                      Cantidad
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      value={m.quantity}
                      onChange={(e) => setMaterial(idx, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMaterials((arr) => arr.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tiempo de armado (min)">
                <Input
                  type="number"
                  value={assemblyMinutes}
                  onChange={(e) => setAssemblyMinutes(e.target.value)}
                />
              </Field>
              <Field label="Tiempo de gestión (min)">
                <Input
                  type="number"
                  value={managementMinutes}
                  onChange={(e) => setManagementMinutes(e.target.value)}
                />
              </Field>
              <Field label="Tiempo de diseño (min)">
                <Input
                  type="number"
                  value={designMinutes}
                  onChange={(e) => setDesignMinutes(e.target.value)}
                />
              </Field>
            </div>
            {Number(designMinutes || '0') > 0 && (
              <p className="text-xs text-muted-foreground">
                El cargo de diseño se suma una sola vez a la línea (no escala con la
                cantidad). Tarifa configurable en Parámetros → "Hora de diseño 3D".
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={calc}>
            Calcular precio
          </Button>
          <Button onClick={submit} disabled={!isFormValid || saving}>
            {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {saving ? 'Guardando…' : 'Crear cotización'}
          </Button>
        </div>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Precio</CardTitle>
          <CardDescription>Aplicado al canal seleccionado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {preview === null && (
            <p className="text-muted-foreground">Click en "Calcular precio" para previsualizar.</p>
          )}
          {preview === 'loading' && <p className="text-muted-foreground">Calculando…</p>}
          {preview === 'error' && <p className="text-destructive">No se pudo calcular.</p>}
          {preview && typeof preview === 'object' && (
            <>
              <Row label="Costo unitario" value={formatMoney(preview.unitCost)} />
              <Row label="Precio unitario" value={formatMoney(preview.unitPrice)} />
              <div className="flex justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                <span className="text-emerald-700 dark:text-emerald-300">Ganancia / unidad</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatMoney(preview.unitProfit)}
                </span>
              </div>
              <Row label="Cantidad" value={quantity} />
              {preview.designSurcharge > 0 && (
                <Row
                  label="Cargo único de diseño"
                  value={formatMoney(preview.designSurcharge)}
                />
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatMoney(preview.lineTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descuento</span>
                <span className="font-mono">- {formatMoney(Number(discount || '0'))}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">Total</span>
                <span className="font-mono font-semibold">{formatMoney(total)}</span>
              </div>
            </>
          )}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
