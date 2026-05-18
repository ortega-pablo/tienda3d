'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useEditMode } from '@/hooks/use-edit-mode';
import { useHasPermission } from '@/components/user-provider';

export interface FilamentOption {
  id: string;
  name: string;
}

export interface MaterialOption {
  id: string;
  name: string;
  type: 'FILAMENT' | 'SHEET' | 'PACKAGING' | 'HARDWARE' | 'OTHER';
  unit: string;
}

export interface KeychainDefaultsDto {
  pieceName: string;
  pieceGrams: number;
  piecePrintMinutes: number;
  pieceFilamentId: string | null;
  assemblyMinutes: number;
  managementMinutes: number;
  materials: Array<{ materialId: string; quantity: number; sortOrder: number }>;
}

interface MaterialDraft {
  materialId: string;
  quantity: string;
}

interface FormState {
  pieceName: string;
  pieceGrams: string;
  piecePrintMinutes: string;
  pieceFilamentId: string;
  assemblyMinutes: string;
  managementMinutes: string;
  materials: MaterialDraft[];
}

function fromDto(d: KeychainDefaultsDto): FormState {
  return {
    pieceName: d.pieceName,
    pieceGrams: String(d.pieceGrams),
    piecePrintMinutes: String(d.piecePrintMinutes),
    pieceFilamentId: d.pieceFilamentId ?? '',
    assemblyMinutes: String(d.assemblyMinutes),
    managementMinutes: String(d.managementMinutes),
    materials: d.materials.map((m) => ({
      materialId: m.materialId,
      quantity: String(m.quantity),
    })),
  };
}

/**
 * Form de los valores precargados en cada cotización de llaveros nueva.
 * Singleton — siempre se persiste sobre la misma fila vía `PUT
 * /keychain-defaults`. Los valores siguen la convención de batch (totales
 * para producir `keychain_batch_size` llaveros, no per-unidad).
 */
export function KeychainDefaultsForm({
  initial,
  filaments,
  nonFilaments,
  batchSize,
}: {
  initial: KeychainDefaultsDto;
  filaments: FilamentOption[];
  nonFilaments: MaterialOption[];
  batchSize: number;
}) {
  const can = useHasPermission();
  const canWrite = can('parameter:write');
  const router = useRouter();
  const editMode = useEditMode();

  const [form, setForm] = useState<FormState>(fromDto(initial));

  const reset = () => setForm(fromDto(initial));

  const setMaterial = (idx: number, patch: Partial<MaterialDraft>) => {
    setForm((f) => {
      const next = [...f.materials];
      next[idx] = { ...next[idx]!, ...patch };
      return { ...f, materials: next };
    });
  };
  const addMaterial = () => {
    setForm((f) => ({
      ...f,
      materials: [
        ...f.materials,
        { materialId: nonFilaments[0]?.id ?? '', quantity: '1' },
      ],
    }));
  };
  const removeMaterial = (idx: number) => {
    setForm((f) => ({ ...f, materials: f.materials.filter((_, i) => i !== idx) }));
  };

  const isFormValid = (() => {
    if (!form.pieceName.trim()) return false;
    if (Number(form.pieceGrams) < 0 || Number(form.piecePrintMinutes) < 0) return false;
    if (Number(form.assemblyMinutes) < 0 || Number(form.managementMinutes) < 0) return false;
    const ids = new Set<string>();
    for (const m of form.materials) {
      if (!m.materialId) return false;
      if (ids.has(m.materialId)) return false;
      ids.add(m.materialId);
      if (Number(m.quantity) <= 0) return false;
    }
    return true;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await editMode.save(
      async () => {
        await api('/keychain-defaults', {
          method: 'PUT',
          body: {
            pieceName: form.pieceName.trim(),
            pieceGrams: Number(form.pieceGrams || '0'),
            piecePrintMinutes: Number(form.piecePrintMinutes || '0'),
            pieceFilamentId: form.pieceFilamentId || null,
            assemblyMinutes: Number(form.assemblyMinutes || '0'),
            managementMinutes: Number(form.managementMinutes || '0'),
            materials: form.materials.map((m) => ({
              materialId: m.materialId,
              quantity: Number(m.quantity),
            })),
          },
        });
        router.refresh();
      },
      { successMessage: 'Valores default actualizados.' },
    );
  };

  const disabled = !editMode.editing;

  return (
    <form onSubmit={submit} className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          {!editMode.editing ? (
            <Button type="button" variant="outline" onClick={editMode.start}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => editMode.cancel(reset)}
                disabled={editMode.saving}
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button type="submit" disabled={editMode.saving || !isFormValid}>
                {editMode.saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                {editMode.saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
        Los valores se cargan como <strong>totales para {batchSize} llaveros</strong> (una
        bandeja). El backend divide internamente al costear. Estos valores aparecen
        precargados al abrir una cotización nueva — el vendedor puede editar, sumar o quitar
        lo que quiera para cada cotización.
      </p>

      <fieldset className="space-y-3 rounded-md border bg-muted/20 p-4">
        <legend className="px-1 text-sm font-medium">Pieza impresa default</legend>
        <div className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <Label htmlFor="pieceName" required>
              Nombre
            </Label>
            <Input
              id="pieceName"
              value={form.pieceName}
              onChange={(e) => setForm({ ...form, pieceName: e.target.value })}
              disabled={disabled}
              placeholder="Llavero"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pieceGrams">Gramos</Label>
            <Input
              id="pieceGrams"
              type="number"
              step="any"
              min="0"
              value={form.pieceGrams}
              onChange={(e) => setForm({ ...form, pieceGrams: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="piecePrintMinutes">Min impr.</Label>
            <Input
              id="piecePrintMinutes"
              type="number"
              step="any"
              min="0"
              value={form.piecePrintMinutes}
              onChange={(e) =>
                setForm({ ...form, piecePrintMinutes: e.target.value })
              }
              disabled={disabled}
            />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="pieceFilamentId">Filamento default</Label>
            <select
              id="pieceFilamentId"
              value={form.pieceFilamentId}
              onChange={(e) => setForm({ ...form, pieceFilamentId: e.target.value })}
              disabled={disabled}
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm disabled:opacity-60"
            >
              <option value="">— Sin filamento —</option>
              {filaments.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border bg-muted/20 p-4">
        <legend className="px-1 text-sm font-medium">Insumos default</legend>
        {form.materials.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Sin insumos default. Agregá los que se usan típicamente (argollas, cierres, etc.)
            con su cantidad para {batchSize} llaveros.
          </p>
        )}
        {form.materials.map((m, idx) => (
          <div key={idx} className="grid gap-2 rounded border bg-background p-2 sm:grid-cols-12">
            <div className="sm:col-span-7">
              <Label className="text-xs" required>
                Insumo
              </Label>
              <select
                value={m.materialId}
                onChange={(e) => setMaterial(idx, { materialId: e.target.value })}
                disabled={disabled}
                className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm disabled:opacity-60"
              >
                <option value="">— Seleccioná insumo —</option>
                {nonFilaments.map((mt) => (
                  <option key={mt.id} value={mt.id}>
                    {mt.name} ({mt.unit.toLowerCase()})
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
                min="0"
                value={m.quantity}
                onChange={(e) => setMaterial(idx, { quantity: e.target.value })}
                disabled={disabled}
                className="font-mono"
              />
            </div>
            <div className="flex items-end sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeMaterial(idx)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        {canWrite && editMode.editing && (
          <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
            <Plus className="h-4 w-4" /> Agregar insumo
          </Button>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded-md border bg-muted/20 p-4">
        <legend className="px-1 text-sm font-medium">Tiempos default</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="assemblyMinutes">Tiempo de armado (min)</Label>
            <Input
              id="assemblyMinutes"
              type="number"
              step="any"
              min="0"
              value={form.assemblyMinutes}
              onChange={(e) =>
                setForm({ ...form, assemblyMinutes: e.target.value })
              }
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="managementMinutes">Tiempo de gestión (min)</Label>
            <Input
              id="managementMinutes"
              type="number"
              step="any"
              min="0"
              value={form.managementMinutes}
              onChange={(e) =>
                setForm({ ...form, managementMinutes: e.target.value })
              }
              disabled={disabled}
            />
          </div>
        </div>
      </fieldset>
    </form>
  );
}
