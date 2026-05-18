'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Save, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useEditMode } from '@/hooks/use-edit-mode';
import { useHasPermission } from '@/components/user-provider';

/**
 * Form aislado para el `keychain_batch_size`. Lo separamos de los demás
 * global params porque conceptualmente es config de cotización de
 * llaveros, no del costeo global. El backend igual lo persiste en
 * `global_params` (sin schema change).
 */
export function KeychainBatchSizeForm({ initial }: { initial: number }) {
  const can = useHasPermission();
  const canWrite = can('parameter:write');
  const router = useRouter();
  const editMode = useEditMode();

  const [value, setValue] = useState(String(initial));
  const reset = () => setValue(String(initial));

  const isValid = (() => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await editMode.save(
      async () => {
        await api('/parameters', {
          method: 'PATCH',
          body: { values: { keychain_batch_size: value } },
        });
        router.refresh();
      },
      { successMessage: 'Tamaño del batch actualizado.' },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="batchSize">Llaveros por batch</Label>
          <div className="relative">
            <Input
              id="batchSize"
              type="number"
              min={1}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!editMode.editing}
              className="pr-20"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              unidades
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuántos llaveros entran en una bandeja de impresión típica. Los inputs
            (gramos, minutos, consumos) de la cotización se interpretan como totales
            para esta cantidad.
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2 pb-1">
            {!editMode.editing ? (
              <Button type="button" variant="outline" onClick={editMode.start}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => editMode.cancel(reset)}
                  disabled={editMode.saving}
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
                <Button type="submit" disabled={editMode.saving || !isValid}>
                  {editMode.saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                  {editMode.saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
