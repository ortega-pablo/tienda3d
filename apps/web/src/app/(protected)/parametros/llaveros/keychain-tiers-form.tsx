'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Save, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useEditMode } from '@/hooks/use-edit-mode';
import { useHasPermission } from '@/components/user-provider';

export interface KeychainTierDto {
  id: string;
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  sortOrder: number;
  notes: string | null;
  updatedAt: string;
}

function tierLabel(t: KeychainTierDto): string {
  if (t.maxQty == null) return `${t.minQty}+`;
  if (t.minQty === t.maxQty) return `${t.minQty}`;
  return `${t.minQty}-${t.maxQty}`;
}

export function KeychainTiersForm({ initial }: { initial: KeychainTierDto[] }) {
  const can = useHasPermission();
  const canWrite = can('parameter:write');
  const router = useRouter();

  const initialMap = Object.fromEntries(initial.map((t) => [t.id, String(t.markupPct)]));
  const [values, setValues] = useState<Record<string, string>>(initialMap);
  const editMode = useEditMode();

  const reset = () => setValues(initialMap);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await editMode.save(
      async () => {
        // Solo PATCH-eamos las tiers que cambiaron. Cada tier es un
        // recurso independiente y el endpoint solo acepta una a la vez.
        const changed = initial.filter((t) => Number(values[t.id]) !== t.markupPct);
        for (const tier of changed) {
          await api(`/keychain-tiers/${tier.id}`, {
            method: 'PATCH',
            body: { markupPct: Number(values[tier.id]) },
          });
        }
        router.refresh();
      },
      { successMessage: 'Markups actualizados.' },
    );
  };

  const isFormValid = initial.every((t) => {
    const raw = values[t.id];
    if (raw == null || raw.trim() === '') return false;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0;
  });

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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Tier</th>
              <th className="py-2 pr-4 font-medium">Cantidades válidas</th>
              <th className="py-2 pr-4 font-medium text-right">Markup %</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {initial.map((t) => (
              <tr key={t.id}>
                <td className="py-3 pr-4 font-medium">{tierLabel(t)}</td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {t.maxQty == null
                    ? `${t.minQty}, ${t.minQty + 5}, ${t.minQty + 10}, … (múltiplos de 5)`
                    : t.minQty < 5
                      ? `${t.minQty}, ${t.minQty + 1}, …, ${t.maxQty}`
                      : `${t.minQty}, ${t.minQty + 5}, …, ${t.maxQty}`}
                </td>
                <td className="py-3 pr-4 text-right">
                  <div className="relative inline-block w-32">
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={values[t.id] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [t.id]: e.target.value }))
                      }
                      disabled={!editMode.editing}
                      className="pr-8 text-right font-mono"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
