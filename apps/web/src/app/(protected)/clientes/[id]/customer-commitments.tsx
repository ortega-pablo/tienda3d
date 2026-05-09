'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, Plus, Save, Trash2, X } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/confirm-provider';
import { useHasPermission } from '@/components/user-provider';
import type { CategoryCommitmentDto, CategoryNode, CustomerWithRelations } from '../types';

interface DraftState {
  categoryId: string;
  minTierQty: string;
  monthlyCommitmentQty: string;
}

export function CustomerCommitments({
  customer,
  categories,
}: {
  customer: CustomerWithRelations;
  categories: CategoryNode[];
}) {
  const can = useHasPermission();
  const canWrite = can('customer:write');
  const router = useRouter();
  const confirm = useConfirm();

  const usedCategoryIds = useMemo(
    () => new Set(customer.categoryCommitments.map((c) => c.categoryId)),
    [customer.categoryCommitments],
  );

  const flatCategories = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const parent of categories) {
      out.push({ id: parent.id, label: `${parent.name} (toda la categoría)` });
      for (const child of parent.children ?? []) {
        out.push({ id: child.id, label: `${parent.name} → ${child.name}` });
      }
    }
    return out;
  }, [categories]);

  const availableForNew = flatCategories.filter((c) => !usedCategoryIds.has(c.id));

  const [draft, setDraft] = useState<DraftState>({
    categoryId: '',
    minTierQty: '5',
    monthlyCommitmentQty: '',
  });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ minTierQty: string; monthlyCommitmentQty: string }>({
    minTierQty: '',
    monthlyCommitmentQty: '',
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => router.refresh();

  const startEdit = (c: CategoryCommitmentDto) => {
    setEditingId(c.id);
    setEditDraft({
      minTierQty: c.minTierQty?.toString() ?? '',
      monthlyCommitmentQty: c.monthlyCommitmentQty?.toString() ?? '',
    });
  };

  const saveEdit = async (c: CategoryCommitmentDto) => {
    setBusyId(c.id);
    try {
      await api(`/customers/${customer.id}/commitments`, {
        method: 'POST',
        body: {
          categoryId: c.categoryId,
          minTierQty: editDraft.minTierQty ? Number(editDraft.minTierQty) : null,
          monthlyCommitmentQty: editDraft.monthlyCommitmentQty
            ? Number(editDraft.monthlyCommitmentQty)
            : null,
        },
      });
      toast.success('Compromiso actualizado.');
      setEditingId(null);
      await reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusyId(null);
    }
  };

  const removeCommitment = async (c: CategoryCommitmentDto) => {
    const ok = await confirm({
      title: `¿Quitar la categoría "${c.categoryName}" de este cliente?`,
      description:
        'El cliente dejará de ver productos de esa categoría y se borrará el tracking de compromiso mensual.',
      confirmLabel: 'Quitar',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusyId(c.id);
    try {
      await api(`/customers/${customer.id}/commitments/${c.id}`, { method: 'DELETE' });
      toast.success('Compromiso eliminado.');
      await reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusyId(null);
    }
  };

  const toggleSuspension = async (c: CategoryCommitmentDto) => {
    const suspend = !c.isWholesaleSuspended;
    if (suspend) {
      const ok = await confirm({
        title: `¿Suspender el mayoreo en "${c.categoryName}"?`,
        description:
          'El cliente seguirá viendo los productos pero pagarán al precio público hasta levantar la suspensión.',
        confirmLabel: 'Suspender',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    setBusyId(c.id);
    try {
      await api(`/customers/${customer.id}/commitments/${c.id}/suspension`, {
        method: 'PATCH',
        body: { suspend },
      });
      toast.success(suspend ? 'Mayoreo suspendido.' : 'Mayoreo reactivado.');
      await reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusyId(null);
    }
  };

  const addCommitment = async () => {
    if (!draft.categoryId) {
      toast.warning('Elegí una categoría');
      return;
    }
    setAdding(true);
    try {
      await api(`/customers/${customer.id}/commitments`, {
        method: 'POST',
        body: {
          categoryId: draft.categoryId,
          minTierQty: draft.minTierQty ? Number(draft.minTierQty) : null,
          monthlyCommitmentQty: draft.monthlyCommitmentQty
            ? Number(draft.monthlyCommitmentQty)
            : null,
        },
      });
      toast.success('Categoría asociada.');
      setDraft({ categoryId: '', minTierQty: '5', monthlyCommitmentQty: '' });
      await reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorías asociadas (mayorista)</CardTitle>
        <CardDescription>
          Cada categoría tiene su propio piso de tier y compromiso mensual. La suspensión es
          granular: si el cliente no cumple en una, se suspende solo esa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {customer.categoryCommitments.length === 0 && (
          <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Sin categorías asociadas. Agregá una para que este cliente acceda al catálogo
            mayorista.
          </p>
        )}

        {customer.categoryCommitments.map((c) => {
          const isEditing = editingId === c.id;
          return (
            <div
              key={c.id}
              className={`rounded-md border p-3 ${
                c.isWholesaleSuspended ? 'border-destructive/40 bg-destructive/5' : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{c.categoryName}</div>
                  {c.isWholesaleSuspended ? (
                    <p className="text-xs text-destructive">
                      Mayoreo suspendido
                      {c.suspendedAt
                        ? ` desde ${new Date(c.suspendedAt).toLocaleDateString('es-AR')}`
                        : ''}
                      {c.suspensionReason ? ` (${c.suspensionReason})` : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Activo</p>
                  )}
                </div>
                {canWrite && !isEditing && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSuspension(c)}
                      disabled={busyId === c.id}
                    >
                      {c.isWholesaleSuspended ? (
                        <>
                          <Play className="h-4 w-4" /> Reactivar
                        </>
                      ) : (
                        <>
                          <Pause className="h-4 w-4 text-destructive" /> Suspender
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCommitment(c)}
                      disabled={busyId === c.id}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Piso de tier (cant.)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={editDraft.minTierQty}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, minTierQty: e.target.value })
                      }
                      placeholder="opcional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Compromiso mensual (unid.)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={editDraft.monthlyCommitmentQty}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, monthlyCommitmentQty: e.target.value })
                      }
                      placeholder="opcional"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button onClick={() => saveEdit(c)} disabled={busyId === c.id}>
                      {busyId === c.id ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                      Guardar
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>
                    <span className="text-muted-foreground">Piso de tier:</span>{' '}
                    {c.minTierQty != null ? `${c.minTierQty} unid.` : '—'}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Compromiso/mes:</span>{' '}
                    {c.monthlyCommitmentQty != null
                      ? `${c.monthlyCommitmentQty} unid.`
                      : 'sin compromiso'}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {canWrite && availableForNew.length > 0 && (
          <div className="rounded-md border border-dashed p-3">
            <p className="mb-2 text-sm font-medium">Asociar categoría</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">Categoría</Label>
                <select
                  value={draft.categoryId}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                >
                  <option value="">Elegir…</option>
                  {availableForNew.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Piso de tier</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.minTierQty}
                  onChange={(e) => setDraft({ ...draft, minTierQty: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Compromiso/mes</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.monthlyCommitmentQty}
                  onChange={(e) =>
                    setDraft({ ...draft, monthlyCommitmentQty: e.target.value })
                  }
                  placeholder="opcional"
                />
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <Button onClick={addCommitment} disabled={adding || !draft.categoryId}>
                {adding ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
                Asociar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
