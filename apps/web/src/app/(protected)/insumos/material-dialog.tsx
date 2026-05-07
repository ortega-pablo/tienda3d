'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import type { MaterialDto, MaterialType, MaterialUnit } from './materials-view';

const TYPES: Array<{ value: MaterialType; label: string }> = [
  { value: 'FILAMENT', label: 'Filamento' },
  { value: 'SHEET', label: 'Hojas' },
  { value: 'PACKAGING', label: 'Packaging' },
  { value: 'HARDWARE', label: 'Hardware' },
  { value: 'OTHER', label: 'Otro' },
];

const UNITS: Array<{ value: MaterialUnit; label: string }> = [
  { value: 'KG', label: 'Kilogramos' },
  { value: 'G', label: 'Gramos' },
  { value: 'UNIT', label: 'Unidades' },
  { value: 'REAM', label: 'Resma' },
  { value: 'METER', label: 'Metros' },
  { value: 'LITER', label: 'Litros' },
];

interface FormState {
  name: string;
  sku: string;
  type: MaterialType;
  unit: MaterialUnit;
  brand: string;
  color: string;
  colorHex: string;
  densityGCm3: string;
  wastePct: string;
  replenishmentMarkupPct: string;
  currentStock: string;
  minStock: string;
  lowStockAlert: boolean;
  notes: string;
}

function initialFromMaterial(m: MaterialDto | null, parent: MaterialDto | null): FormState {
  if (m) {
    return {
      name: m.name,
      sku: m.sku ?? '',
      type: m.type,
      unit: m.unit,
      brand: m.brand ?? '',
      color: m.color ?? '',
      colorHex: m.colorHex ?? '',
      densityGCm3: m.densityGCm3?.toString() ?? '',
      wastePct: m.wastePct?.toString() ?? '5',
      replenishmentMarkupPct: m.replenishmentMarkupPct?.toString() ?? '15',
      currentStock: m.currentStock?.toString() ?? '0',
      minStock: m.minStock?.toString() ?? '0',
      lowStockAlert: m.lowStockAlert,
      notes: m.notes ?? '',
    };
  }
  if (parent) {
    // Creating a variant: prefill from parent so the user only fills color + stock.
    return {
      name: '',
      sku: '',
      type: 'FILAMENT',
      unit: parent.unit,
      brand: parent.brand ?? '',
      color: '',
      colorHex: '#000000',
      densityGCm3: parent.densityGCm3?.toString() ?? '',
      wastePct: parent.wastePct?.toString() ?? '5',
      replenishmentMarkupPct: parent.replenishmentMarkupPct?.toString() ?? '15',
      currentStock: '0',
      minStock: '0',
      lowStockAlert: true,
      notes: '',
    };
  }
  return {
    name: '',
    sku: '',
    type: 'FILAMENT',
    unit: 'KG',
    brand: '',
    color: '',
    colorHex: '',
    densityGCm3: '1.24',
    wastePct: '5',
    replenishmentMarkupPct: '15',
    currentStock: '0',
    minStock: '0',
    lowStockAlert: true,
    notes: '',
  };
}

export function MaterialDialog({
  material,
  parent,
  onClose,
  onSaved,
}: {
  material: MaterialDto | null;
  parent: MaterialDto | null;
  onClose: () => void;
  onSaved: (m: MaterialDto, isNew: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(initialFromMaterial(material, parent));
  const [saving, setSaving] = useState(false);

  const isFilament = form.type === 'FILAMENT';
  const isVariant = parent != null || !!material?.parentId;
  const isNewVariant = parent != null && !material;
  const isFilamentParent = isFilament && !isVariant;

  const title = (() => {
    if (material) return `Editar: ${material.name}`;
    if (parent) return `Nuevo color de ${parent.name}`;
    return 'Nuevo insumo';
  })();

  const isFormValid = (() => {
    if (!form.name.trim()) return false;
    if (isFilamentParent && !form.brand.trim()) return false;
    if (isVariant && !form.color.trim()) return false;
    return true;
  })();

  const save = async () => {
    setSaving(true);
    try {
      const variantParentId = isVariant
        ? material?.parentId ?? parent?.id ?? null
        : null;

      const body = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        type: form.type,
        unit: form.unit,
        // parentId is only sent on creation. Backend rejects changes after.
        ...(isNewVariant && variantParentId ? { parentId: variantParentId } : {}),
        brand: isFilament ? form.brand.trim() || null : null,
        // Color belongs to children only; parents leave it null.
        color: isVariant ? form.color.trim() || null : null,
        colorHex: isVariant && form.colorHex ? form.colorHex : null,
        densityGCm3:
          isFilament && form.densityGCm3 ? Number(form.densityGCm3) : null,
        wastePct: Number(form.wastePct),
        // Variants inherit the parent's replenishmentMarkupPct (set by the parent).
        ...(isVariant ? {} : { replenishmentMarkupPct: Number(form.replenishmentMarkupPct) }),
        currentStock: isFilamentParent ? 0 : Number(form.currentStock),
        minStock: isFilamentParent ? 0 : Number(form.minStock),
        lowStockAlert: isFilamentParent ? false : form.lowStockAlert,
        notes: form.notes.trim() || null,
      };
      const result = material
        ? await api<MaterialDto>(`/materials/${material.id}`, { method: 'PATCH', body })
        : await api<MaterialDto>('/materials', { method: 'POST', body });
      toast.success(material ? 'Insumo actualizado.' : 'Insumo creado.');
      onSaved(result, !material);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card shadow-lg">
        <div className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">{title}</h2>

          {isVariant && (
            <p className="rounded-md border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
              Las variantes heredan marca, unidad, densidad, desperdicio y precio del filamento
              padre. Acá sólo cargás color y stock propios.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={isVariant ? 'Nombre completo (ej. PLA Grilon · Rojo)' : 'Nombre'} required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="SKU">
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="Opcional"
              />
            </Field>
            <Field label="Tipo" required>
              <Select
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v as MaterialType })}
                disabled={isVariant}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unidad" required>
              <Select
                value={form.unit}
                onChange={(v) => setForm({ ...form, unit: v as MaterialUnit })}
                disabled={isVariant}
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {isFilament && !isVariant && (
            <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
              <Field label="Marca" required>
                <Input
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
              </Field>
              <Field label="Densidad (g/cm³)">
                <Input
                  type="number"
                  step="0.001"
                  value={form.densityGCm3}
                  onChange={(e) => setForm({ ...form, densityGCm3: e.target.value })}
                />
              </Field>
            </div>
          )}

          {isVariant && (
            <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
              <Field label="Color" required>
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="Ej. Rojo intenso"
                />
              </Field>
              <Field label="Color hex">
                <Input
                  type="color"
                  value={form.colorHex || '#000000'}
                  onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                  className="h-10 p-1"
                />
              </Field>
            </div>
          )}

          {!isFilamentParent && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Desperdicio (%)">
                <Input
                  type="number"
                  step="0.1"
                  value={form.wastePct}
                  onChange={(e) => setForm({ ...form, wastePct: e.target.value })}
                  disabled={isVariant}
                />
              </Field>
              <Field
                label="Reabastecimiento (%)"
                hint={
                  isVariant
                    ? 'Heredado del filamento padre.'
                    : 'Recargo sobre el costo bruto para reponer stock. NO es ganancia.'
                }
              >
                <Input
                  type="number"
                  step="0.1"
                  value={form.replenishmentMarkupPct}
                  onChange={(e) =>
                    setForm({ ...form, replenishmentMarkupPct: e.target.value })
                  }
                  disabled={isVariant}
                />
              </Field>
              <Field label="Stock actual">
                <Input
                  type="number"
                  step="0.001"
                  value={form.currentStock}
                  onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                />
              </Field>
              <Field label="Stock mínimo">
                <Input
                  type="number"
                  step="0.001"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                />
              </Field>
            </div>
          )}

          {isFilamentParent && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Desperdicio (%)">
                <Input
                  type="number"
                  step="0.1"
                  value={form.wastePct}
                  onChange={(e) => setForm({ ...form, wastePct: e.target.value })}
                />
              </Field>
              <Field
                label="Reabastecimiento (%)"
                hint="Recargo sobre el costo bruto para reponer stock. NO es ganancia."
              >
                <Input
                  type="number"
                  step="0.1"
                  value={form.replenishmentMarkupPct}
                  onChange={(e) =>
                    setForm({ ...form, replenishmentMarkupPct: e.target.value })
                  }
                />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                El padre no acumula stock — agregá variantes (colores) después de guardar.
                Las variantes heredan el reabastecimiento de este filamento.
              </p>
            </div>
          )}

          {!isFilamentParent && (
            <Checkbox
              label="Alertar cuando esté bajo stock mínimo"
              checked={form.lowStockAlert}
              onChange={(e) => setForm({ ...form, lowStockAlert: e.target.checked })}
            />
          )}

          <Field label="Notas">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!isFormValid || saving}>
              {saving && <Spinner size="sm" />}
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label required={required}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {children}
    </select>
  );
}
