'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/confirm-provider';
import { useEditMode } from '@/hooks/use-edit-mode';
import { useHasPermission } from '@/components/user-provider';
import {
  TYPE_DESCRIPTION,
  TYPE_LABEL,
  type CustomerType,
  type CustomerWithRelations,
} from '../types';

interface FormState {
  name: string;
  type: CustomerType;
  email: string;
  phone: string;
  taxId: string;
  notes: string;
  isActive: boolean;
  hasPortalAccess: boolean;
  skipChannelCommission: boolean;
  skipMarketing: boolean;
  skipRegime: boolean;
  skipReinvestment: boolean;
}

const TYPE_OPTIONS: CustomerType[] = ['WHOLESALE', 'CONSIGNMENT', 'SPECIAL'];

function fromCustomer(c: CustomerWithRelations | null): FormState {
  if (c) {
    return {
      name: c.name,
      type: c.type,
      email: c.email ?? '',
      phone: c.phone ?? '',
      taxId: c.taxId ?? '',
      notes: '',
      isActive: c.isActive,
      hasPortalAccess: c.hasPortalAccess,
      skipChannelCommission: c.skipChannelCommission,
      skipMarketing: c.skipMarketing,
      skipRegime: c.skipRegime,
      skipReinvestment: c.skipReinvestment,
    };
  }
  return {
    name: '',
    type: 'WHOLESALE',
    email: '',
    phone: '',
    taxId: '',
    notes: '',
    isActive: true,
    hasPortalAccess: false,
    skipChannelCommission: false,
    skipMarketing: false,
    skipRegime: false,
    skipReinvestment: false,
  };
}

/**
 * Defaults sugeridos al cambiar el preset desde el form. Espejo de
 * `computePresetFlags` del backend.
 */
function presetDefaults(type: CustomerType) {
  if (type === 'CONSIGNMENT') {
    return {
      skipChannelCommission: true,
      skipMarketing: true,
      skipRegime: false,
      skipReinvestment: false,
    };
  }
  return {
    skipChannelCommission: false,
    skipMarketing: false,
    skipRegime: false,
    skipReinvestment: false,
  };
}

export function CustomerEditor({
  mode,
  customer,
}: {
  mode: 'create' | 'edit';
  customer?: CustomerWithRelations;
}) {
  const can = useHasPermission();
  const canWrite = can('customer:write');
  const router = useRouter();
  const confirm = useConfirm();
  const initial = useMemo(() => fromCustomer(customer ?? null), [customer]);
  const [form, setForm] = useState<FormState>(initial);
  const editMode = useEditMode(mode === 'create');
  const readOnly = !editMode.editing || !canWrite;

  const isFormValid = form.name.trim().length > 0;

  const onTypeChange = (t: CustomerType) => {
    // Cambiar el preset sugiere defaults pero solo si el usuario no las
    // tocó manualmente (heurística: si todas las flags coinciden con el
    // preset anterior, las actualizamos).
    setForm((f) => ({ ...f, type: t, ...presetDefaults(t) }));
  };

  const handleSave = async () => {
    await editMode.save(
      async () => {
        const body = {
          name: form.name.trim(),
          type: form.type,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          taxId: form.taxId.trim() || null,
          notes: form.notes.trim() || null,
          isActive: form.isActive,
          hasPortalAccess: form.hasPortalAccess,
          skipChannelCommission: form.skipChannelCommission,
          skipMarketing: form.skipMarketing,
          skipRegime: form.skipRegime,
          skipReinvestment: form.skipReinvestment,
        };
        const result = mode === 'create'
          ? await api<{ id: string }>('/customers', { method: 'POST', body })
          : await api<{ id: string }>(`/customers/${customer!.id}`, {
              method: 'PATCH',
              body,
            });
        if (mode === 'create') router.replace(`/clientes/${result.id}`);
        else router.refresh();
      },
      { successMessage: mode === 'create' ? 'Cliente creado.' : 'Cliente actualizado.' },
    );
  };

  const handleRemove = async () => {
    if (!customer) return;
    const ok = await confirm({
      title: `¿Eliminar el cliente "${customer.name}"?`,
      description:
        'Si tiene cotizaciones históricas, se desactiva en lugar de eliminarse para preservar los registros.',
      confirmLabel: 'Eliminar',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/customers/${customer.id}`, { method: 'DELETE' });
      toast.success('Cliente eliminado.');
      router.replace('/clientes');
    } catch (err) {
      handleApiError(err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Datos básicos y configuración</CardTitle>
          <CardDescription>{TYPE_DESCRIPTION[form.type]}</CardDescription>
        </div>
        {canWrite && mode === 'edit' && !editMode.editing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={editMode.start}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <Button variant="ghost" onClick={handleRemove}>
              <Trash2 className="h-4 w-4 text-destructive" />
              Eliminar
            </Button>
          </div>
        )}
        {canWrite && editMode.editing && (
          <div className="flex gap-2">
            {mode === 'edit' && (
              <Button
                variant="ghost"
                onClick={() => editMode.cancel(() => setForm(initial))}
                disabled={editMode.saving}
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
            )}
            <Button onClick={handleSave} disabled={!isFormValid || editMode.saving}>
              {editMode.saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre / razón social" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Tipo" required>
              <select
                value={form.type}
                onChange={(e) => onTypeChange(e.target.value as CustomerType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="CUIT/CUIL">
              <Input
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                placeholder="20-12345678-9"
              />
            </Field>
          </div>

          <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">Pricing flags</p>
            <Checkbox
              label="Sin comisión de canal"
              checked={form.skipChannelCommission}
              onChange={(e) => setForm({ ...form, skipChannelCommission: e.target.checked })}
            />
            <Checkbox
              label="Sin marketing prorrateado"
              checked={form.skipMarketing}
              onChange={(e) => setForm({ ...form, skipMarketing: e.target.checked })}
            />
            <Checkbox
              label="Sin régimen tributario"
              checked={form.skipRegime}
              onChange={(e) => setForm({ ...form, skipRegime: e.target.checked })}
            />
            <Checkbox
              label="Sin reinversión"
              checked={form.skipReinvestment}
              onChange={(e) => setForm({ ...form, skipReinvestment: e.target.checked })}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Ajustes que el motor aplica automáticamente al cotizar para este cliente. El
              preset (tipo) sugiere defaults; podés sobrescribir cualquier flag manualmente.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox
              label="Cliente activo"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <Checkbox
              label="Acceso al portal"
              checked={form.hasPortalAccess}
              onChange={(e) => setForm({ ...form, hasPortalAccess: e.target.checked })}
            />
          </div>
        </fieldset>
      </CardContent>
    </Card>
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
