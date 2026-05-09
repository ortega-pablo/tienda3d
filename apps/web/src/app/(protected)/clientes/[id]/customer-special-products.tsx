'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2, X } from 'lucide-react';
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
import type {
  CustomerProductOverrideDto,
  CustomerWithRelations,
  ProductSummaryDto,
} from '../types';

export function CustomerSpecialProducts({
  customer,
  products,
}: {
  customer: CustomerWithRelations;
  products: ProductSummaryDto[];
}) {
  const can = useHasPermission();
  const canWrite = can('customer:write');
  const router = useRouter();
  const confirm = useConfirm();

  const assignedIds = useMemo(
    () => new Set(customer.productOverrides.map((p) => p.productId)),
    [customer.productOverrides],
  );
  const availableProducts = products.filter((p) => p.isActive && !assignedIds.has(p.id));

  const [draft, setDraft] = useState({ productId: '', customMarkupPct: '' });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMarkup, setEditMarkup] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => router.refresh();

  const startEdit = (p: CustomerProductOverrideDto) => {
    setEditingId(p.productId);
    setEditMarkup(p.customMarkupPct?.toString() ?? '');
  };

  const saveEdit = async (p: CustomerProductOverrideDto) => {
    setBusy(p.productId);
    try {
      await api(`/customers/${customer.id}/products`, {
        method: 'POST',
        body: {
          productId: p.productId,
          customMarkupPct: editMarkup ? Number(editMarkup) : null,
        },
      });
      toast.success('Override actualizado.');
      setEditingId(null);
      await reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(null);
    }
  };

  const removeProduct = async (p: CustomerProductOverrideDto) => {
    const ok = await confirm({
      title: `¿Quitar "${p.productName}" del cliente?`,
      description: 'El cliente dejará de poder cotizarlo.',
      confirmLabel: 'Quitar',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(p.productId);
    try {
      await api(`/customers/${customer.id}/products/${p.productId}`, { method: 'DELETE' });
      toast.success('Producto quitado.');
      await reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(null);
    }
  };

  const addProduct = async () => {
    if (!draft.productId) {
      toast.warning('Elegí un producto');
      return;
    }
    setAdding(true);
    try {
      await api(`/customers/${customer.id}/products`, {
        method: 'POST',
        body: {
          productId: draft.productId,
          customMarkupPct: draft.customMarkupPct ? Number(draft.customMarkupPct) : null,
        },
      });
      toast.success('Producto asignado.');
      setDraft({ productId: '', customMarkupPct: '' });
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
        <CardTitle>Productos asignados (especial)</CardTitle>
        <CardDescription>
          Solo estos productos van a estar disponibles para este cliente. Opcionalmente podés
          fijar un markup% específico que pisa el del producto y al de las tiers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {customer.productOverrides.length === 0 && (
          <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Sin productos asignados todavía. El cliente no podrá cotizar nada hasta que le
            asignes al menos uno.
          </p>
        )}

        {customer.productOverrides.map((p) => {
          const isEditing = editingId === p.productId;
          return (
            <div key={p.productId} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{p.productName}</div>
                  {!isEditing && (
                    <p className="text-xs text-muted-foreground">
                      {p.customMarkupPct != null
                        ? `Markup custom: ${p.customMarkupPct}%`
                        : 'Sin override de markup (usa target del producto / tiers).'}
                    </p>
                  )}
                </div>
                {canWrite && !isEditing && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeProduct(p)}
                      disabled={busy === p.productId}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
              {isEditing && (
                <div className="mt-3 flex items-end gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Markup% (vacío = usa default)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={editMarkup}
                      onChange={(e) => setEditMarkup(e.target.value)}
                      placeholder="ej. 45"
                    />
                  </div>
                  <Button onClick={() => saveEdit(p)} disabled={busy === p.productId}>
                    {busy === p.productId ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                    Guardar
                  </Button>
                  <Button variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {canWrite && availableProducts.length > 0 && (
          <div className="rounded-md border border-dashed p-3">
            <p className="mb-2 text-sm font-medium">Asignar producto</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">Producto</Label>
                <select
                  value={draft.productId}
                  onChange={(e) => setDraft({ ...draft, productId: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                >
                  <option value="">Elegir…</option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.categoryName ? ` (${p.categoryName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Markup% override</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={draft.customMarkupPct}
                  onChange={(e) => setDraft({ ...draft, customMarkupPct: e.target.value })}
                  placeholder="opcional"
                />
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <Button onClick={addProduct} disabled={adding || !draft.productId}>
                {adding ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
                Asignar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
