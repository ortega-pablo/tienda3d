'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { formatMoney, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useEditMode } from '@/hooks/use-edit-mode';
import { useHasPermission } from '@/components/user-provider';

export interface MaterialLite {
  id: string;
  name: string;
  type: 'FILAMENT' | 'SHEET' | 'PACKAGING' | 'HARDWARE' | 'OTHER';
  unit: 'KG' | 'G' | 'UNIT' | 'REAM' | 'METER' | 'LITER';
  parentId: string | null;
  colorHex: string | null;
  isActive: boolean;
}

export type ChannelKind = 'DIRECT_SALE' | 'CASH' | 'MARKETPLACE' | 'CUSTOM';

export interface ChannelLite {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  kind: ChannelKind;
  isActive: boolean;
  isSystem: boolean;
}

export interface MachineLite {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CategoryLite {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  /** Subcategorías cuando es padre. */
  children?: CategoryLite[];
}

interface PieceState {
  id?: string;
  name: string;
  grams: string;
  printMinutes: string;
  defaultFilamentId: string;
}
interface MaterialState {
  materialId: string;
  quantity: string;
}

interface ChannelState {
  channelId: string;
  isEnabled: boolean;
  /** Only used for MARKETPLACE channels — required when isEnabled. */
  commissionPct: string;
  notes: string;
}

export interface ProductDto {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  marketingMonthly: number;
  estimatedUnitsMonth: number;
  assemblyMinutes: number;
  managementMinutes: number;
  machineId: string | null;
  machineName: string | null;
  /** Categoría obligatoria — el markup viene 100% de ella. */
  categoryId: string;
  categoryName: string;
  categoryParentId: string | null;
  pieces: Array<{
    id: string;
    name: string;
    grams: number;
    printMinutes: number;
    defaultFilamentId: string | null;
    sortOrder: number;
  }>;
  materials: Array<{ materialId: string; quantity: number }>;
  channels: Array<{
    channelId: string;
    channelName: string;
    channelSlug: string;
    channelKind: ChannelKind;
    isEnabled: boolean;
    commissionPct: number | null;
    notes: string | null;
  }>;
}

export interface CostingResult {
  productId: string;
  productName: string;
  filament: {
    items: Array<{ pieceId: string; pieceName: string; total: number; rawCost: number; wasteAmount: number; filamentName: string }>;
    raw: number;
    waste: number;
    total: number;
    replenishment: number;
    totalWithReplenishment: number;
    totalMinutes: number;
  };
  materials: {
    items: Array<{
      materialId: string;
      materialName: string;
      total: number;
      replenishmentPct: number;
      replenishmentAmount: number;
      totalWithReplenishment: number;
    }>;
    total: number;
    replenishment: number;
    totalWithReplenishment: number;
  };
  machine: { minutes: number; perHour: number; total: number };
  labor: {
    minutes: number;
    perHourRaw?: number;
    markupPct?: number;
    perHour: number;
    markupAmount?: number;
    total: number;
  };
  marketing: { monthly: number; units: number; perUnit: number };
  /** Logic C v3 */
  process?: number;
  fabricationPrice?: number;
  totalCost?: number;
  /** Legacy aliases (kept para compat). */
  productionCost: number;
  contingency: number;
  reinvestment: number;
  costWithProvisions: number;
  warnings: string[];
}

const EMPTY_PIECE: PieceState = {
  name: '',
  grams: '',
  printMinutes: '',
  defaultFilamentId: '',
};

interface FormState {
  name: string;
  description: string;
  isActive: boolean;
  marketingMonthly: string;
  estimatedUnitsMonth: string;
  assemblyMinutes: string;
  managementMinutes: string;
  machineId: string;
  categoryId: string;
  pieces: PieceState[];
  materials: MaterialState[];
  channels: ChannelState[];
}

function channelStateFromProduct(p: ProductDto, available: ChannelLite[]): ChannelState[] {
  const byId = new Map(p.channels.map((c) => [c.channelId, c]));
  return available.map((ch) => {
    const existing = byId.get(ch.id);
    return {
      channelId: ch.id,
      isEnabled: existing?.isEnabled ?? false,
      commissionPct: existing?.commissionPct?.toString() ?? '',
      notes: existing?.notes ?? '',
    };
  });
}

function defaultChannelState(available: ChannelLite[]): ChannelState[] {
  return available.map((ch) => ({
    channelId: ch.id,
    // System DIRECT_SALE and CASH channels start enabled by default.
    isEnabled: ch.isSystem && (ch.kind === 'DIRECT_SALE' || ch.kind === 'CASH'),
    commissionPct: '',
    notes: '',
  }));
}

function buildInitialState(
  product: ProductDto | undefined,
  available: ChannelLite[],
): FormState {
  if (product) {
    return {
      name: product.name,
      description: product.description ?? '',
      isActive: product.isActive,
      marketingMonthly: product.marketingMonthly.toString(),
      estimatedUnitsMonth: product.estimatedUnitsMonth.toString(),
      assemblyMinutes: product.assemblyMinutes.toString(),
      managementMinutes: product.managementMinutes.toString(),
      machineId: product.machineId ?? '',
      categoryId: product.categoryId,
      pieces: product.pieces.map((piece) => ({
        id: piece.id,
        name: piece.name,
        grams: piece.grams.toString(),
        printMinutes: piece.printMinutes.toString(),
        defaultFilamentId: piece.defaultFilamentId ?? '',
      })),
      materials: product.materials.map((m) => ({
        materialId: m.materialId,
        quantity: m.quantity.toString(),
      })),
      channels: channelStateFromProduct(product, available),
    };
  }
  return {
    name: '',
    description: '',
    isActive: true,
    marketingMonthly: '0',
    estimatedUnitsMonth: '1',
    assemblyMinutes: '0',
    managementMinutes: '0',
    machineId: '',
    categoryId: '',
    // Form arranca vacío: el usuario decide si agregar piezas, insumos o ambos.
    // El backend valida que tenga al menos uno de los dos.
    pieces: [],
    materials: [],
    channels: defaultChannelState(available),
  };
}

interface Props {
  mode: 'create' | 'edit';
  product?: ProductDto;
  materials: MaterialLite[];
  availableChannels: ChannelLite[];
  machines: MachineLite[];
  categories: CategoryLite[];
  initialCost?: CostingResult | null;
}

export function ProductEditor({
  mode,
  product,
  materials,
  availableChannels,
  machines,
  categories,
  initialCost,
}: Props) {
  const can = useHasPermission();
  const canWrite = can('product:write');
  const router = useRouter();
  const initialFormState = useMemo(
    () => buildInitialState(product, availableChannels),
    [product, availableChannels],
  );
  const [form, setForm] = useState<FormState>(initialFormState);
  const [cost, setCost] = useState<CostingResult | null>(initialCost ?? null);

  // Create flow stays editable; edit flow starts read-only and toggles via "Editar".
  const editMode = useEditMode(mode === 'create');
  const readOnly = !editMode.editing || !canWrite;

  const channelsById = useMemo(
    () => new Map(availableChannels.map((c) => [c.id, c])),
    [availableChannels],
  );
  const filaments = useMemo(() => materials.filter((m) => m.type === 'FILAMENT'), [materials]);
  const nonFilaments = useMemo(() => materials.filter((m) => m.type !== 'FILAMENT'), [materials]);

  useEffect(() => {
    if (mode === 'edit' && product) setCost(initialCost ?? null);
  }, [mode, product, initialCost]);

  const setPiece = (index: number, patch: Partial<PieceState>) => {
    setForm((f) => {
      const pieces = [...f.pieces];
      pieces[index] = { ...pieces[index]!, ...patch };
      return { ...f, pieces };
    });
  };
  const setMaterial = (index: number, patch: Partial<MaterialState>) => {
    setForm((f) => {
      const mats = [...f.materials];
      mats[index] = { ...mats[index]!, ...patch };
      return { ...f, materials: mats };
    });
  };

  const addPiece = () => setForm((f) => ({ ...f, pieces: [...f.pieces, { ...EMPTY_PIECE }] }));
  const removePiece = (idx: number) =>
    setForm((f) => ({ ...f, pieces: f.pieces.filter((_, i) => i !== idx) }));

  const addMaterial = () =>
    setForm((f) => ({
      ...f,
      materials: [...f.materials, { materialId: nonFilaments[0]?.id ?? '', quantity: '1' }],
    }));
  const removeMaterial = (idx: number) =>
    setForm((f) => ({ ...f, materials: f.materials.filter((_, i) => i !== idx) }));

  const setChannel = (channelId: string, patch: Partial<ChannelState>) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.map((c) => (c.channelId === channelId ? { ...c, ...patch } : c)),
    }));
  };

  const buildPayload = () => ({
    name: form.name,
    description: form.description || null,
    isActive: form.isActive,
    marketingMonthly: Number(form.marketingMonthly),
    estimatedUnitsMonth: Number(form.estimatedUnitsMonth),
    assemblyMinutes: Number(form.assemblyMinutes),
    managementMinutes: Number(form.managementMinutes),
    machineId: form.machineId || null,
    categoryId: form.categoryId,
    pieces: form.pieces.map((p, idx) => ({
      name: p.name,
      grams: Number(p.grams),
      printMinutes: Number(p.printMinutes || '0'),
      defaultFilamentId: p.defaultFilamentId,
      sortOrder: idx,
    })),
    materials: form.materials
      .filter((m) => m.materialId && m.quantity)
      .map((m) => ({ materialId: m.materialId, quantity: Number(m.quantity) })),
    channels: form.channels.map((c) => {
      const channel = channelsById.get(c.channelId);
      const allowCommission = channel?.kind === 'CUSTOM' || channel?.kind === 'MARKETPLACE';
      return {
        channelId: c.channelId,
        isEnabled: c.isEnabled,
        commissionPct: allowCommission && c.commissionPct ? Number(c.commissionPct) : null,
        notes: c.notes || null,
      };
    }),
  });

  const validateBeforeSave = (): string | null => {
    for (const c of form.channels) {
      if (!c.isEnabled) continue;
      const channel = channelsById.get(c.channelId);
      if (channel?.kind === 'MARKETPLACE' && !c.commissionPct) {
        return `${channel.name} requiere cargar la comisión por producto antes de guardar.`;
      }
    }
    return null;
  };

  /**
   * Mirrors the backend rules so the save button reflects readiness:
   *   - Producto debe tener al menos 1 pieza impresa O 1 insumo (no las dos).
   *   - Si hay piezas, cada una requiere nombre, gramos > 0,
   *     printMinutes > 0 y filamento default.
   *   - Si hay insumos, cada uno requiere material + cantidad > 0.
   */
  const isFormValid = useMemo<boolean>(() => {
    if (!form.name.trim()) return false;
    if (!form.machineId) return false;
    // Categoría obligatoria: el markup viene 100% de la categoría/subcategoría.
    if (!form.categoryId) return false;

    // Validar piezas (todos sus campos obligatorios cuando la pieza existe).
    for (const p of form.pieces) {
      if (!p.name.trim()) return false;
      if (!(Number(p.grams || '0') > 0)) return false;
      if (!(Number(p.printMinutes || '0') > 0)) return false;
      if (!p.defaultFilamentId) return false;
    }
    // Validar insumos (material + cantidad > 0 si existe la fila).
    for (const m of form.materials) {
      if (!m.materialId) return false;
      if (!(Number(m.quantity || '0') > 0)) return false;
    }
    // Al menos pieza o insumo.
    if (form.pieces.length === 0 && form.materials.length === 0) return false;

    // MARKETPLACE channels enabled need commission filled.
    for (const c of form.channels) {
      if (!c.isEnabled) continue;
      const channel = channelsById.get(c.channelId);
      if (channel?.kind === 'MARKETPLACE' && !c.commissionPct) return false;
    }
    return true;
  }, [form, channelsById]);

  const handleSave = async () => {
    const validation = validateBeforeSave();
    if (validation) {
      toast.warning(validation);
      return;
    }
    await editMode.save(
      async () => {
        const payload = buildPayload();
        const result =
          mode === 'create'
            ? await api<ProductDto>('/products', { method: 'POST', body: payload })
            : await api<ProductDto>(`/products/${product!.id}`, { method: 'PUT', body: payload });
        // Always re-fetch the cost after save so the panel reflects persisted state.
        const fresh = await api<CostingResult>(`/products/${result.id}/cost`).catch(() => null);
        setCost(fresh);
        if (mode === 'create') router.replace(`/productos/${result.id}`);
        else router.refresh();
      },
      { successMessage: mode === 'create' ? 'Producto creado.' : 'Producto actualizado.' },
    );
  };

  const cancelEdit = () => editMode.cancel(() => setForm(initialFormState));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {canWrite && (
          <div className="flex justify-end gap-2">
            {mode === 'edit' && !editMode.editing ? (
              <Button variant="outline" onClick={editMode.start}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            ) : (
              <>
                {mode === 'edit' && (
                  <Button variant="ghost" onClick={cancelEdit} disabled={editMode.saving}>
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                )}
                <Button onClick={handleSave} disabled={!isFormValid || editMode.saving}>
                  {editMode.saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                  {editMode.saving
                    ? 'Guardando…'
                    : mode === 'create'
                      ? 'Crear producto'
                      : 'Guardar cambios'}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Fieldset disabled cascades to every input/button/select inside.
            Reset browser default styles (border/padding/margin/min-width) so
            it acts like a transparent wrapper. We deliberately avoid
            `display: contents` because it has interop issues with React's
            DOM reconciliation in some browsers (insertBefore mismatches). */}
        <fieldset
          disabled={readOnly}
          className="m-0 min-w-0 space-y-4 border-0 p-0"
        >
        <Card>
          <CardHeader>
            <CardTitle>Datos del producto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="SKU">
              <Input
                value={mode === 'edit' && product?.sku ? product.sku : 'Se asigna al guardar (PTK-PROD-NNNNNN)'}
                disabled
                readOnly
                className="font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Auto-generado por el sistema. Inmutable después de la creación.
              </p>
            </Field>
            <Field label="Marketing mensual ($)">
              <Input
                type="number"
                step="any"
                value={form.marketingMonthly}
                onChange={(e) => setForm({ ...form, marketingMonthly: e.target.value })}
              />
            </Field>
            <Field label="Unidades estimadas / mes">
              <Input
                type="number"
                step="any"
                value={form.estimatedUnitsMonth}
                onChange={(e) => setForm({ ...form, estimatedUnitsMonth: e.target.value })}
              />
            </Field>
            <Field label="Tiempo armado (min)">
              <Input
                type="number"
                step="any"
                value={form.assemblyMinutes}
                onChange={(e) => setForm({ ...form, assemblyMinutes: e.target.value })}
              />
            </Field>
            <Field label="Tiempo gestión (min)">
              <Input
                type="number"
                step="any"
                value={form.managementMinutes}
                onChange={(e) => setForm({ ...form, managementMinutes: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Máquina (impresora)" required>
                <select
                  value={form.machineId}
                  onChange={(e) => setForm({ ...form, machineId: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Seleccioná una máquina…</option>
                  {machines.map((mc) => (
                    <option key={mc.id} value={mc.id}>
                      {mc.name}
                      {!mc.isActive ? ' (inactiva)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Impresora donde se fabrica el producto. No afecta el costo (siempre se usa la
                  máquina activa).
                </p>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Categoría" required>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Seleccioná una categoría…</option>
                  {categories.map((parent) => {
                    const childOptions = (parent.children ?? [])
                      .filter((c) => c.isActive || c.id === form.categoryId)
                      .map((child) => (
                        <option key={child.id} value={child.id}>
                          {parent.name} → {child.name}
                          {!child.isActive ? ' (inactiva)' : ''}
                        </option>
                      ));
                    if (!parent.isActive && parent.id !== form.categoryId && childOptions.length === 0) {
                      return null;
                    }
                    return (
                      <optgroup key={parent.id} label={parent.name}>
                        {(parent.isActive || parent.id === form.categoryId) && (
                          <option value={parent.id}>
                            {parent.name}
                            {!parent.isActive ? ' (inactiva)' : ''}
                          </option>
                        )}
                        {childOptions}
                      </optgroup>
                    );
                  })}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  El <strong>markup y las escalas vienen de la categoría</strong> (con herencia
                  subcategoría → padre). Configuralas en{' '}
                  <a className="underline" href="/categorias">Gestionar categorías</a>.
                </p>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Descripción">
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {form.pieces.length === 0 && form.materials.length === 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            ⚠ El producto debe tener <strong>al menos una pieza impresa o un insumo</strong>.
            Agregá lo que corresponda usando los botones abajo.
          </div>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Piezas impresas</CardTitle>
              <CardDescription>
                Cada pieza usa un filamento por marca; el color se elige al fabricar.
              </CardDescription>
            </div>
            {canWrite && (
              <Button variant="outline" size="sm" onClick={addPiece}>
                <Plus className="h-4 w-4" /> Agregar pieza
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {form.pieces.map((piece, idx) => (
              <div key={idx} className="grid gap-2 rounded-md border p-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <Label className="text-xs" required>
                    Nombre
                  </Label>
                  <Input
                    value={piece.name}
                    onChange={(e) => setPiece(idx, { name: e.target.value })}
                    placeholder="Tapa delantera"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs" required>
                    Gramos
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    value={piece.grams}
                    onChange={(e) => setPiece(idx, { grams: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs" required>
                    Min impr.
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    value={piece.printMinutes}
                    onChange={(e) => setPiece(idx, { printMinutes: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-xs" required>
                    Filamento por defecto
                  </Label>
                  <select
                    value={piece.defaultFilamentId}
                    onChange={(e) => setPiece(idx, { defaultFilamentId: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                  >
                    <option value="">— ninguno —</option>
                    {filaments.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                {canWrite && (
                  <div className="flex items-end justify-end sm:col-span-12">
                    <Button variant="ghost" size="sm" onClick={() => removePiece(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" /> Quitar
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {form.pieces.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin piezas impresas. Agregá una si el producto se fabrica en la impresora.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Insumos extra</CardTitle>
              <CardDescription>Hojas, packaging, hardware, etc.</CardDescription>
            </div>
            {canWrite && (
              <Button variant="outline" size="sm" onClick={addMaterial}>
                <Plus className="h-4 w-4" /> Agregar insumo
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {form.materials.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin insumos extra.</p>
            )}
            {form.materials.map((mat, idx) => {
              const m = materials.find((x) => x.id === mat.materialId);
              return (
                <div key={idx} className="grid gap-2 rounded-md border p-3 sm:grid-cols-12">
                  <div className="sm:col-span-7">
                    <Label className="text-xs" required>
                      Insumo
                    </Label>
                    <select
                      value={mat.materialId}
                      onChange={(e) => setMaterial(idx, { materialId: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    >
                      {nonFilaments.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unit.toLowerCase()})
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
                      value={mat.quantity}
                      onChange={(e) => setMaterial(idx, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <Button variant="ghost" size="sm" onClick={() => removeMaterial(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {m && (
                    <p className="text-xs text-muted-foreground sm:col-span-12">
                      Tipo: {m.type.toLowerCase()} · unidad: {m.unit.toLowerCase()}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Canales de venta</CardTitle>
            <CardDescription>
              Elegí dónde se vende este producto. Venta Directa y Efectivo vienen pre-seleccionados.
              MercadoLibre requiere cargar la comisión por producto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.channels.map((c) => {
              const channel = channelsById.get(c.channelId);
              if (!channel) return null;
              const isLockedKind = channel.kind === 'DIRECT_SALE' || channel.kind === 'CASH';
              const isMarketplace = channel.kind === 'MARKETPLACE';
              const showFields = c.isEnabled && !isLockedKind;
              return (
                <div
                  key={c.channelId}
                  className={
                    c.isEnabled
                      ? 'rounded-md border border-primary/30 bg-primary/5 p-3'
                      : 'rounded-md border p-3'
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={c.isEnabled}
                        onChange={(e) => setChannel(c.channelId, { isEnabled: e.target.checked })}
                        disabled={!canWrite}
                        className="h-4 w-4 rounded border-input"
                      />
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          {channel.icon && <span>{channel.icon}</span>}
                          {channel.name}
                          {isLockedKind && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                              comisión global
                            </span>
                          )}
                          {isMarketplace && (
                            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase text-accent">
                              comisión por producto
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {channel.kind === 'DIRECT_SALE' &&
                            'Comisión definida en Parámetros · régimen aplicado'}
                          {channel.kind === 'CASH' &&
                            'Sin comisión · régimen aplicado (toggleable para admins)'}
                          {channel.kind === 'MARKETPLACE' &&
                            'Cargá la comisión que cobra el marketplace por este producto'}
                          {channel.kind === 'CUSTOM' &&
                            'Canal libre — opcional override de comisión'}
                        </div>
                      </div>
                    </label>
                  </div>

                  {showFields && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {isMarketplace && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">
                            Comisión <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            value={c.commissionPct}
                            onChange={(e) =>
                              setChannel(c.channelId, { commissionPct: e.target.value })
                            }
                            placeholder="ej. 13"
                            disabled={!canWrite}
                          />
                        </div>
                      )}
                      {channel.kind === 'CUSTOM' && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Comisión override (%)</Label>
                          <Input
                            type="number"
                            step="any"
                            value={c.commissionPct}
                            onChange={(e) =>
                              setChannel(c.channelId, { commissionPct: e.target.value })
                            }
                            placeholder="hereda canal"
                            disabled={!canWrite}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
        </fieldset>
      </div>

      <CostPanel cost={cost} mode={mode} />
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

function CostPanel({
  cost,
  mode,
}: {
  cost: CostingResult | null;
  mode: 'create' | 'edit';
}) {
  if (mode === 'create') {
    return (
      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Costo</CardTitle>
          <CardDescription>El costo se calcula al guardar el producto.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!cost) {
    return (
      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Costo</CardTitle>
          <CardDescription>No se pudo calcular. Revisá filamentos y precios.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Logic C v3: el markup es por tier (per canal + qty), así que la ganancia
  // de bolsillo varía. Acá solo mostramos el costo; los precios y profits
  // detallados se ven en la matriz de precios debajo, alimentada por las
  // escalas de la categoría del producto.
  const fabrication = cost.fabricationPrice ?? cost.costWithProvisions;
  const otherWithReab = cost.materials.totalWithReplenishment ?? cost.materials.total;
  const totalCost = cost.totalCost ?? cost.costWithProvisions;
  const filamentReab = cost.filament.replenishment ?? 0;
  const filamentWithReab = cost.filament.totalWithReplenishment ?? cost.filament.total;
  const materialsReab = cost.materials.replenishment ?? 0;
  const laborMarkup = cost.labor.markupAmount ?? 0;

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>Costo unitario</CardTitle>
        <CardDescription>Logic C v3 — fabricación + reabastecimiento por insumo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-3xl font-bold">{formatMoney(totalCost)}</div>
          <div className="text-xs text-muted-foreground">costo total por unidad</div>
        </div>

        <dl className="space-y-1 text-sm">
          <Row
            label="Filamento"
            value={filamentWithReab}
            sub={
              filamentReab > 0
                ? `${formatNumber(cost.filament.totalMinutes, 0)} min · incluye ${formatMoney(filamentReab)} de reab.`
                : `${formatNumber(cost.filament.totalMinutes, 0)} min`
            }
          />
          <Row
            label="Hora-máquina"
            value={cost.machine.total}
            sub={formatMoney(cost.machine.perHour) + '/h'}
          />
          <Row
            label="Mano de obra"
            value={cost.labor.total}
            sub={
              laborMarkup > 0
                ? `${formatNumber(cost.labor.minutes, 0)} min · incluye ${formatMoney(laborMarkup)} de recargo`
                : `${formatNumber(cost.labor.minutes, 0)} min`
            }
          />
          <Row
            label="Marketing"
            value={cost.marketing.perUnit}
            sub={`${formatMoney(cost.marketing.monthly)}/${formatNumber(cost.marketing.units, 0)}`}
          />
          <Row label="+ Contingencia" value={cost.contingency} muted />
          <Row label="+ Reinversión" value={cost.reinvestment} muted />
          <div className="my-2 border-t" />
          <Row label="Precio de fabricación" value={fabrication} bold />

          {otherWithReab > 0 && (
            <>
              <div className="my-2 border-t" />
              <Row
                label="Otros insumos (post-profit)"
                value={otherWithReab}
                sub={
                  materialsReab > 0
                    ? `incluye ${formatMoney(materialsReab)} de reab.`
                    : undefined
                }
              />
            </>
          )}

          <div className="my-2 border-t" />
          <Row label="Costo total" value={totalCost} bold />
        </dl>

        <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          La ganancia y el precio final dependen del tier y canal. Mirá la
          matriz de precios debajo — viene de las escalas configuradas en la
          categoría del producto.
        </p>

        {cost.warnings.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">
            {cost.warnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, sub, bold, muted }: { label: string; value: number; sub?: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${muted ? 'text-muted-foreground' : ''}`}>
      <div>
        <div className={bold ? 'font-medium' : ''}>{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className={`font-mono ${bold ? 'font-semibold' : ''}`}>{formatMoney(value)}</div>
    </div>
  );
}
