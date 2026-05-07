'use client';

import { useEffect, useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useHasPermission } from '@/components/user-provider';
import type { MaterialDto } from './materials-view';

interface StockMovement {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'WASTE';
  quantity: number;
  unitCost: number | null;
  productionCode: string | null;
  notes: string | null;
  createdByName: string;
  createdAt: string;
}

const TYPE_LABEL: Record<StockMovement['type'], string> = {
  IN: 'Ingreso',
  OUT: 'Consumo',
  ADJUSTMENT: 'Ajuste',
  WASTE: 'Desperdicio',
};

const TYPE_COLOR: Record<StockMovement['type'], string> = {
  IN: 'text-success',
  OUT: 'text-destructive',
  ADJUSTMENT: 'text-muted-foreground',
  WASTE: 'text-warning',
};

export function MovementsDialog({
  material,
  onClose,
  onMaterialUpdated,
}: {
  material: MaterialDto;
  onClose: () => void;
  onMaterialUpdated: (m: MaterialDto) => void;
}) {
  const can = useHasPermission();
  const canAdjust = can('stock:write');
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [delta, setDelta] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const data = await api<StockMovement[]>(
      `/stock-movements?materialId=${material.id}&limit=100`,
    );
    setMovements(data);
  };

  useEffect(() => {
    let cancelled = false;
    api<StockMovement[]>(`/stock-movements?materialId=${material.id}&limit=100`)
      .then((d) => {
        if (!cancelled) setMovements(d);
      })
      .catch((err) => {
        if (!cancelled) handleApiError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [material.id]);

  const adjust = async (sign: 1 | -1) => {
    const value = Number(delta);
    if (!value || value <= 0) {
      toast.warning('Ingresá una cantidad mayor a 0');
      return;
    }
    setSaving(true);
    try {
      const updated = await api<MaterialDto>(`/materials/${material.id}/stock-adjust`, {
        method: 'POST',
        body: { delta: value * sign, notes: notes || null },
      });
      onMaterialUpdated(updated);
      setDelta('');
      setNotes('');
      toast.success(sign > 0 ? 'Stock incrementado.' : 'Stock descontado.');
      await reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-card shadow-lg">
        <div className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Stock — {material.name}</h2>
              <p className="text-sm text-muted-foreground">
                Stock actual:{' '}
                <span className="font-mono font-semibold">
                  {formatNumber(material.currentStock, 3)} {material.unit.toLowerCase()}
                </span>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>

          {canAdjust && (
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="mb-3 text-sm font-medium">Ajuste manual</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" required>
                    Cantidad
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={delta}
                    onChange={(e) => setDelta(e.target.value)}
                    placeholder={`En ${material.unit.toLowerCase()}`}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Notas</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Compra, conteo, devolución…"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => adjust(-1)}
                  disabled={saving || !Number(delta)}
                >
                  {saving ? <Spinner size="sm" /> : <Minus className="h-4 w-4" />} Restar
                </Button>
                <Button size="sm" onClick={() => adjust(1)} disabled={saving || !Number(delta)}>
                  {saving ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />} Sumar
                </Button>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Histórico de movimientos</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : movements && movements.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium text-right">Cantidad</th>
                      <th className="px-3 py-2 font-medium">Origen</th>
                      <th className="px-3 py-2 font-medium">Por</th>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className={`px-3 py-2 text-xs uppercase ${TYPE_COLOR[m.type]}`}>
                          {TYPE_LABEL[m.type]}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {m.type === 'OUT' || m.type === 'WASTE' ? '−' : '+'}
                          {formatNumber(m.quantity, 3)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {m.productionCode ?? m.notes ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{m.createdByName}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(m.createdAt).toLocaleString('es-AR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                Sin movimientos registrados.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

