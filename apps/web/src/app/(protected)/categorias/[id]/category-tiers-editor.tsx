'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useEditMode } from '@/hooks/use-edit-mode';
import { useHasPermission } from '@/components/user-provider';

export interface CategoryDetailDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  baseMarkupPct: number | null;
  isActive: boolean;
}

export interface ChannelLite {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  isActive: boolean;
}

interface TierDto {
  id: string;
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  notes: string | null;
}

interface TiersResolution {
  tiers: TierDto[];
  source: 'own' | 'inherited' | 'none';
  inheritedFromCategoryId: string | null;
}

interface TierDraft {
  // tier sin id todavía cuando es nueva.
  id?: string;
  minQty: string;
  maxQty: string; // vacío = abierta (null)
  markupPct: string;
}

function fromDto(tiers: TierDto[]): TierDraft[] {
  return tiers.map((t) => ({
    id: t.id,
    minQty: String(t.minQty),
    maxQty: t.maxQty == null ? '' : String(t.maxQty),
    markupPct: String(t.markupPct),
  }));
}

export function CategoryTiersEditor({
  category,
  channels,
  tiersByChannel,
}: {
  category: CategoryDetailDto;
  channels: ChannelLite[];
  tiersByChannel: Record<string, TiersResolution>;
}) {
  const can = useHasPermission();
  const canWrite = can('category:write');
  const router = useRouter();

  const [activeChannelId, setActiveChannelId] = useState<string>(channels[0]?.id ?? '');
  // Estado por canal: cada tab tiene su propio draft + flag de modo
  // "heredar del padre" (vaciar tiers propias).
  const [drafts, setDrafts] = useState<Record<string, TierDraft[]>>(() =>
    Object.fromEntries(
      Object.entries(tiersByChannel).map(([chId, r]) => [
        chId,
        // Si los tiers vienen heredados los mostramos en modo "vista del
        // padre" — el draft arranca vacío para que el toggle quede en
        // "heredar". Si los activa el admin con "Definir propios" arranca
        // copia de los heredados para que pueda editar.
        r.source === 'inherited' ? [] : fromDto(r.tiers),
      ]),
    ),
  );
  const [inheritByChannel, setInheritByChannel] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.entries(tiersByChannel).map(([chId, r]) => [chId, r.source === 'inherited']),
    ),
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeResolution = tiersByChannel[activeChannelId];
  const activeDraft = drafts[activeChannelId] ?? [];
  const activeInherit = inheritByChannel[activeChannelId] ?? false;

  const editMode = useEditMode();

  // ----- baseMarkupPct -----
  const [baseMarkup, setBaseMarkup] = useState(
    category.baseMarkupPct != null ? String(category.baseMarkupPct) : '',
  );
  const baseChanged = baseMarkup !== (category.baseMarkupPct != null ? String(category.baseMarkupPct) : '');

  const saveBase = async () => {
    if (!canWrite) return;
    try {
      await api(`/categories/${category.id}`, {
        method: 'PATCH',
        body: {
          baseMarkupPct: baseMarkup.trim() === '' ? null : Number(baseMarkup),
        },
      });
      toast.success('Markup base actualizado.');
      router.refresh();
    } catch (err) {
      handleApiError(err);
    }
  };

  // ----- tiers helpers -----
  const setDraft = (chId: string, next: TierDraft[]) => {
    setDrafts((prev) => ({ ...prev, [chId]: next }));
  };

  const addTier = (chId: string) => {
    const current = drafts[chId] ?? [];
    // Sugerimos un minQty contiguo a la última tier.
    const last = current.at(-1);
    const suggestedMin = last && last.maxQty ? String(Number(last.maxQty) + 1) : '1';
    setDraft(chId, [...current, { minQty: suggestedMin, maxQty: '', markupPct: '' }]);
  };

  const updateTier = (chId: string, idx: number, patch: Partial<TierDraft>) => {
    const current = drafts[chId] ?? [];
    setDraft(
      chId,
      current.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    );
  };

  const removeTier = (chId: string, idx: number) => {
    const current = drafts[chId] ?? [];
    setDraft(
      chId,
      current.filter((_, i) => i !== idx),
    );
  };

  const toggleInherit = (chId: string, willInherit: boolean) => {
    setInheritByChannel((prev) => ({ ...prev, [chId]: willInherit }));
    if (!willInherit && (drafts[chId] ?? []).length === 0) {
      // Pasar de "heredar" a "propios" sin tiers: arrancamos con la copia
      // heredada (si la había) para que el admin tenga algo que editar.
      const resolution = tiersByChannel[chId];
      if (resolution && resolution.tiers.length > 0) {
        setDraft(chId, fromDto(resolution.tiers));
      }
    }
  };

  /**
   * Valida el set actual contra las invariantes del backend antes de mandar.
   * Replica lo que hace CategoryTiersService.validateTierSet — así el
   * usuario ve el error sin esperar el 400.
   */
  const validateDraft = (draft: TierDraft[]): string | null => {
    if (draft.length === 0) return null; // vacío es válido (vuelve a heredar)
    const parsed = draft.map((t, idx) => ({
      idx,
      minQty: Number(t.minQty),
      maxQty: t.maxQty.trim() === '' ? null : Number(t.maxQty),
      markupPct: Number(t.markupPct),
    }));
    for (const t of parsed) {
      if (!Number.isInteger(t.minQty) || t.minQty < 1) {
        return `Tier #${t.idx + 1}: minQty debe ser entero ≥ 1.`;
      }
      if (t.maxQty != null && (!Number.isInteger(t.maxQty) || t.maxQty < t.minQty)) {
        return `Tier #${t.idx + 1}: maxQty debe ser entero ≥ minQty.`;
      }
      if (!Number.isFinite(t.markupPct) || t.markupPct < 0) {
        return `Tier #${t.idx + 1}: markupPct debe ser ≥ 0.`;
      }
    }
    const sorted = [...parsed].sort((a, b) => a.minQty - b.minQty);
    if (sorted[0]!.minQty !== 1) return 'La primera escala debe arrancar en 1.';
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (prev.maxQty == null) {
        return `Tier #${curr.idx + 1}: la escala anterior es abierta — no puede haber otra después.`;
      }
      if (curr.minQty !== prev.maxQty + 1) {
        return `Tier #${curr.idx + 1}: debe arrancar en ${prev.maxQty + 1} para no dejar huecos.`;
      }
      if (curr.markupPct >= prev.markupPct) {
        return `Tier #${curr.idx + 1}: el markup (${curr.markupPct}%) debe ser menor al de la escala anterior (${prev.markupPct}%).`;
      }
    }
    return null;
  };

  const saveTiers = async () => {
    if (!canWrite || !activeChannel) return;
    const toSend: TierDraft[] = activeInherit ? [] : activeDraft;
    const err = validateDraft(toSend);
    if (err) {
      toast.error(err);
      return;
    }
    await editMode.save(
      async () => {
        await api(`/categories/${category.id}/tiers`, {
          method: 'PUT',
          body: {
            channelId: activeChannel.id,
            tiers: toSend.map((t) => ({
              minQty: Number(t.minQty),
              maxQty: t.maxQty.trim() === '' ? null : Number(t.maxQty),
              markupPct: Number(t.markupPct),
            })),
          },
        });
        router.refresh();
      },
      {
        successMessage: activeInherit
          ? `Escalas borradas — ${activeChannel.name} hereda del padre.`
          : `Escalas de ${activeChannel.name} guardadas.`,
      },
    );
  };

  if (channels.length === 0) {
    return (
      <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        No hay canales activos. Activá canales del sistema para configurar escalas.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* ----- Markup base ----- */}
      <div className="rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label>
              Markup base{' '}
              <span className="text-xs font-normal text-muted-foreground">
                — fallback cuando ninguna escala cubre la cantidad
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <div className="relative w-32">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={baseMarkup}
                  onChange={(e) => setBaseMarkup(e.target.value)}
                  disabled={!canWrite}
                  placeholder={category.parentId ? 'hereda del padre' : '100'}
                  className="pr-7 font-mono"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                  %
                </span>
              </div>
              {canWrite && baseChanged && (
                <Button size="sm" onClick={saveBase}>
                  <Save className="h-4 w-4" /> Guardar
                </Button>
              )}
            </div>
            {category.parentId && baseMarkup.trim() === '' && (
              <p className="text-xs text-muted-foreground">
                Vacío = hereda el markup base del padre.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ----- Tabs por canal ----- */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {channels.map((c) => {
          const r = tiersByChannel[c.id];
          const isActive = activeChannelId === c.id;
          const summary =
            r?.source === 'own'
              ? `${r.tiers.length} propias`
              : r?.source === 'inherited'
                ? `heredadas`
                : 'sin escalas';
          return (
            <button
              key={c.id}
              onClick={() => setActiveChannelId(c.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.icon && <span className="mr-1">{c.icon}</span>}
              {c.name}
              <span className="ml-1 text-[10px] text-muted-foreground">· {summary}</span>
            </button>
          );
        })}
      </div>

      {/* ----- Tab content ----- */}
      {activeChannel && activeResolution && (
        <div className="space-y-3">
          {category.parentId && (
            <div className="flex items-center justify-between rounded-md border bg-background p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Herencia del padre</p>
                <p className="text-xs text-muted-foreground">
                  Si está activado, esta subcategoría usa las escalas del padre para{' '}
                  <strong>{activeChannel.name}</strong>. Apagalo para definir las propias.
                </p>
              </div>
              <Button
                variant={activeInherit ? 'default' : 'outline'}
                size="sm"
                disabled={!canWrite}
                onClick={() => toggleInherit(activeChannel.id, !activeInherit)}
              >
                {activeInherit ? '✓ Heredando' : 'Heredar del padre'}
              </Button>
            </div>
          )}

          {activeInherit ? (
            <div className="rounded-md border bg-muted/20 p-4 text-sm">
              <p className="text-muted-foreground">
                Heredando del padre (
                {activeResolution.tiers.length > 0 ? (
                  <>
                    <strong>{activeResolution.tiers.length}</strong> escala(s)
                  </>
                ) : (
                  'sin escalas en el padre tampoco'
                )}
                ).
              </p>
              {activeResolution.tiers.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs font-mono">
                  {activeResolution.tiers.map((t) => (
                    <li key={t.id}>
                      {t.minQty}
                      {t.maxQty == null ? '+' : `-${t.maxQty}`} → {t.markupPct}%
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => toggleInherit(activeChannel.id, false)}
                >
                  <Pencil className="h-4 w-4" /> Definir propias
                </Button>
              )}
            </div>
          ) : (
            <TierTable
              tiers={activeDraft}
              canWrite={canWrite}
              onAdd={() => addTier(activeChannel.id)}
              onUpdate={(idx, patch) => updateTier(activeChannel.id, idx, patch)}
              onRemove={(idx) => removeTier(activeChannel.id, idx)}
            />
          )}

          {canWrite && (
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={saveTiers} disabled={editMode.saving}>
                {editMode.saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                {editMode.saving ? 'Guardando…' : 'Guardar escalas'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TierTable({
  tiers,
  canWrite,
  onAdd,
  onUpdate,
  onRemove,
}: {
  tiers: TierDraft[];
  canWrite: boolean;
  onAdd: () => void;
  onUpdate: (idx: number, patch: Partial<TierDraft>) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="space-y-2">
      {tiers.length === 0 && (
        <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          Sin escalas. Agregá la primera (debe arrancar en minQty = 1).
        </p>
      )}
      {tiers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Desde</th>
                <th className="py-2 pr-3 font-medium">Hasta</th>
                <th className="py-2 pr-3 font-medium text-right">Markup %</th>
                {canWrite && <th className="py-2 pr-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {tiers.map((t, idx) => (
                <tr key={idx}>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{idx + 1}</td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={1}
                      value={t.minQty}
                      onChange={(e) => onUpdate(idx, { minQty: e.target.value })}
                      disabled={!canWrite}
                      className="w-24 font-mono"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={1}
                      value={t.maxQty}
                      onChange={(e) => onUpdate(idx, { maxQty: e.target.value })}
                      placeholder="∞"
                      disabled={!canWrite}
                      className="w-24 font-mono"
                    />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      value={t.markupPct}
                      onChange={(e) => onUpdate(idx, { markupPct: e.target.value })}
                      disabled={!canWrite}
                      className="w-24 font-mono text-right"
                    />
                  </td>
                  {canWrite && (
                    <td className="py-2 pr-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemove(idx)}
                        title="Eliminar"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && (
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Agregar escala
        </Button>
      )}
    </div>
  );
}
