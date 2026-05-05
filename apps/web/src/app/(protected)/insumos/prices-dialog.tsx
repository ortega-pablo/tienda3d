'use client';

import { useEffect, useState } from 'react';
import { Check, Plus, Star, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useHasPermission } from '@/components/user-provider';
import type { MaterialDto, SupplierLite } from './materials-view';

interface PriceEntry {
  id: string;
  supplierId: string;
  supplierName: string;
  price: number;
  packSize: number | null;
  packPrice: number | null;
  currency: string;
  link: string | null;
  leadTimeDays: number | null;
  isCurrent: boolean;
  registeredAt: string;
  notes: string | null;
}

type PriceMode = 'unit' | 'pack';

export function PricesDialog({
  material,
  suppliers,
  onClose,
  onMaterialUpdated,
}: {
  material: MaterialDto;
  suppliers: SupplierLite[];
  onClose: () => void;
  onMaterialUpdated: (m: MaterialDto) => void;
}) {
  const can = useHasPermission();
  const canWrite = can('material:write');
  const [prices, setPrices] = useState<PriceEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<PriceMode>('unit');
  const [newEntry, setNewEntry] = useState({
    supplierId: suppliers[0]?.id ?? '',
    price: '',
    packSize: '',
    packPrice: '',
    currency: 'ARS',
    link: '',
    leadTimeDays: '',
    notes: '',
    setCurrent: true,
  });

  const derivedUnitPrice = (() => {
    if (mode !== 'pack') return null;
    const size = Number(newEntry.packSize);
    const total = Number(newEntry.packPrice);
    if (!Number.isFinite(size) || size <= 0) return null;
    if (!Number.isFinite(total) || total <= 0) return null;
    return total / size;
  })();

  useEffect(() => {
    let cancelled = false;
    api<PriceEntry[]>(`/materials/${material.id}/prices`)
      .then((data) => {
        if (!cancelled) setPrices(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los precios');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [material.id]);

  const refreshAll = async () => {
    const [pricesFresh, materialFresh] = await Promise.all([
      api<PriceEntry[]>(`/materials/${material.id}/prices`),
      api<MaterialDto>(`/materials/${material.id}`),
    ]);
    setPrices(pricesFresh);
    onMaterialUpdated(materialFresh);
  };

  const addPrice = async () => {
    setError(null);
    setAdding(true);
    try {
      const priceFields =
        mode === 'pack'
          ? {
              packSize: Number(newEntry.packSize),
              packPrice: Number(newEntry.packPrice),
            }
          : { price: Number(newEntry.price) };
      await api(`/materials/${material.id}/prices`, {
        method: 'POST',
        body: {
          supplierId: newEntry.supplierId,
          ...priceFields,
          currency: newEntry.currency || 'ARS',
          link: newEntry.link || null,
          leadTimeDays: newEntry.leadTimeDays ? Number(newEntry.leadTimeDays) : null,
          notes: newEntry.notes || null,
          setCurrent: newEntry.setCurrent,
        },
      });
      setNewEntry({
        ...newEntry,
        price: '',
        packSize: '',
        packPrice: '',
        link: '',
        leadTimeDays: '',
        notes: '',
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar el precio');
    } finally {
      setAdding(false);
    }
  };

  const setCurrent = async (priceId: string) => {
    try {
      await api(`/materials/${material.id}/prices/${priceId}/current`, { method: 'PATCH' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el vigente');
    }
  };

  const remove = async (priceId: string) => {
    if (!confirm('¿Eliminar este registro de precio?')) return;
    try {
      await api(`/materials/${material.id}/prices/${priceId}`, { method: 'DELETE' });
      await refreshAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-card shadow-lg">
        <div className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Precios — {material.name}</h2>
              <p className="text-sm text-muted-foreground">
                Histórico por proveedor. Marcá uno como vigente para que se use en los costos.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {canWrite && (
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Registrar nuevo precio</p>
                <div className="inline-flex rounded-md border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMode('unit')}
                    className={`px-3 py-1 rounded ${mode === 'unit' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}
                  >
                    Por unidad
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('pack')}
                    className={`px-3 py-1 rounded ${mode === 'pack' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}
                  >
                    Por paquete
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Proveedor</Label>
                  <select
                    value={newEntry.supplierId}
                    onChange={(e) => setNewEntry({ ...newEntry, supplierId: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {mode === 'unit' ? (
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                    <Label>Precio por unidad</Label>
                    <Input
                      type="number"
                      step="any"
                      value={newEntry.price}
                      onChange={(e) => setNewEntry({ ...newEntry, price: e.target.value })}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>Cantidad por paquete</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={newEntry.packSize}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, packSize: e.target.value })
                        }
                        placeholder="ej. 500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Precio del paquete</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={newEntry.packPrice}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, packPrice: e.target.value })
                        }
                        placeholder="ej. 17844"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label>Lead time (días)</Label>
                  <Input
                    type="number"
                    value={newEntry.leadTimeDays}
                    onChange={(e) =>
                      setNewEntry({ ...newEntry, leadTimeDays: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Link</Label>
                  <Input
                    value={newEntry.link}
                    onChange={(e) => setNewEntry({ ...newEntry, link: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notas</Label>
                  <Input
                    value={newEntry.notes}
                    onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                  />
                </div>
              </div>

              {mode === 'pack' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {derivedUnitPrice != null
                    ? `Precio unitario calculado: ${formatMoney(derivedUnitPrice, newEntry.currency)} por ${material.unit.toLowerCase()}`
                    : 'Cargá cantidad y precio del paquete para ver el unitario.'}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between">
                <Checkbox
                  label="Marcar como vigente"
                  checked={newEntry.setCurrent}
                  onChange={(e) => setNewEntry({ ...newEntry, setCurrent: e.target.checked })}
                />
                <Button
                  onClick={addPrice}
                  disabled={
                    !newEntry.supplierId ||
                    adding ||
                    (mode === 'unit'
                      ? !newEntry.price
                      : !newEntry.packSize || !newEntry.packPrice)
                  }
                >
                  <Plus className="h-4 w-4" />
                  {adding ? 'Agregando…' : 'Agregar precio'}
                </Button>
              </div>
            </div>
          )}

          <div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : prices && prices.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Vigente</th>
                      <th className="px-3 py-2 font-medium">Proveedor</th>
                      <th className="px-3 py-2 font-medium">Precio</th>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {prices.map((p) => (
                      <tr key={p.id} className={p.isCurrent ? 'bg-primary/5' : ''}>
                        <td className="px-3 py-2">
                          {p.isCurrent ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium uppercase text-primary-foreground">
                              <Check className="h-3 w-3" />
                              vigente
                            </span>
                          ) : canWrite ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCurrent(p.id)}
                              className="h-7"
                            >
                              <Star className="h-3 w-3" />
                              Marcar
                            </Button>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{p.supplierName}</div>
                          {p.link && (
                            <a
                              href={p.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              link
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatMoney(p.price, p.currency)}
                          {p.packSize != null && p.packPrice != null && (
                            <div className="text-xs font-normal text-muted-foreground">
                              {formatMoney(p.packPrice, p.currency)} / {p.packSize}{' '}
                              {material.unit.toLowerCase()}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(p.registeredAt).toLocaleDateString('es-AR')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canWrite && !p.isCurrent && (
                            <Button variant="ghost" size="sm" onClick={() => remove(p.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                Sin precios registrados aún.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
