'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { CategoryNode } from './categories-view';

interface FormState {
  name: string;
  slug: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
  notes: string;
  /** Vacío = NULL en backend (hereda del padre). */
  baseMarkupPct: string;
}

function initial(category: CategoryNode | null): FormState {
  if (category) {
    return {
      name: category.name,
      slug: category.slug,
      icon: category.icon ?? '',
      sortOrder: category.sortOrder.toString(),
      isActive: category.isActive,
      notes: category.notes ?? '',
      baseMarkupPct: category.baseMarkupPct != null ? category.baseMarkupPct.toString() : '',
    };
  }
  return {
    name: '',
    slug: '',
    icon: '',
    sortOrder: '0',
    isActive: true,
    notes: '',
    baseMarkupPct: '',
  };
}

export function CategoryDialog({
  mode,
  category,
  parent,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  category: CategoryNode | null;
  parent: CategoryNode | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial(category));
  const [saving, setSaving] = useState(false);

  const title = (() => {
    if (mode === 'edit' && category) return `Editar: ${category.name}`;
    if (parent) return `Nueva subcategoría de "${parent.name}"`;
    return 'Nueva categoría';
  })();

  const isFormValid = form.name.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        icon: form.icon.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        notes: form.notes.trim() || null,
        // baseMarkupPct vacío = null (hereda del padre).
        baseMarkupPct:
          form.baseMarkupPct.trim() === '' ? null : Number(form.baseMarkupPct),
      };
      // Slug se manda solo si el usuario lo editó manualmente (sino el
      // backend lo deriva del nombre con slugify).
      if (form.slug.trim()) body.slug = form.slug.trim();
      if (mode === 'create' && parent) body.parentId = parent.id;

      if (mode === 'edit' && category) {
        await api(`/categories/${category.id}`, { method: 'PATCH', body });
        toast.success('Categoría actualizada.');
      } else {
        await api('/categories', { method: 'POST', body });
        toast.success('Categoría creada.');
      }
      onSaved();
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-card shadow-lg">
        <div className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">{title}</h2>

          {parent && (
            <p className="rounded-md border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
              Será una subcategoría de <strong>{parent.name}</strong>. La jerarquía se limita a
              dos niveles: una subcategoría no puede tener hijas.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </Field>
            <Field
              label="Slug"
              hint="Si lo dejás vacío se genera del nombre."
            >
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="auto"
              />
            </Field>
            <Field label="Ícono (emoji)">
              <Input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="💡"
                maxLength={4}
              />
            </Field>
            <Field label="Orden">
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                min={0}
              />
            </Field>
            <Field label="Notas (opcional)">
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <Field
              label="Markup base %"
              hint={
                parent
                  ? 'Vacío = hereda del padre. Aplica cuando ningún tier cubre la cantidad.'
                  : 'Markup default cuando ningún tier cubre la cantidad.'
              }
            >
              <Input
                type="number"
                step="any"
                min={0}
                value={form.baseMarkupPct}
                onChange={(e) => setForm({ ...form, baseMarkupPct: e.target.value })}
                placeholder={parent ? 'hereda del padre' : '100'}
              />
            </Field>
            <div className="flex items-end">
              <Checkbox
                label="Categoría activa"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
            </div>
          </div>

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
