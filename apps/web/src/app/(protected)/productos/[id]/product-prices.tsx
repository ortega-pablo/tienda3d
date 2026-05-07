'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatMoney, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/confirm-provider';
import { useCurrentUser, useHasPermission } from '@/components/user-provider';

type ChannelKind = 'DIRECT_SALE' | 'CASH' | 'MARKETPLACE' | 'CUSTOM';

interface PriceLine {
  markupPct: number;
  commissionPct: number;
  taxBurdenPct: number;
  denominator: number;
  netPrice: number;
  finalPrice: number;
  profit: number;
  effectiveMarginPct: number;
  missingCommission: boolean;
  warnings: string[];
}

interface ChannelTierPrice {
  tierId: string | null;
  minQty: number;
  maxQty: number | null;
  line: PriceLine;
}

interface ChannelPriceBlock {
  channelId: string;
  channelName: string;
  channelSlug: string;
  channelKind: ChannelKind;
  icon: string | null;
  taxMode: 'SIMPLE' | 'DETAILED';
  withInvoiceDefault: boolean;
  enabled: boolean;
  needsConfig: boolean;
  productCommissionPct: number | null;
  base: PriceLine | null;
  tiers: ChannelTierPrice[];
}

export interface ProductPricesResponse {
  productId: string;
  productName: string;
  /** Logic C v3 — base del profit. */
  fabricationPrice?: number;
  otherMaterialsWithReplenishment?: number;
  totalCost?: number;
  /** Legacy alias (= totalCost). */
  costWithProvisions: number;
  profitPerUnit: number;
  targetMarkupPct: number;
  channels: ChannelPriceBlock[];
}

export interface ChannelLite {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  kind: ChannelKind;
  isActive: boolean;
  isSystem: boolean;
  commissionPct: number;
}

export interface TierDto {
  id: string;
  minQty: number;
  maxQty: number | null;
  markupPct: number | null;
  notes: string | null;
}

export function ProductPrices({
  productId,
  initialPrices,
  initialTiers,
}: {
  productId: string;
  initialPrices: ProductPricesResponse | null;
  initialTiers: TierDto[];
}) {
  const can = useHasPermission();
  const user = useCurrentUser();
  const canWrite = can('product:write');
  const canSeeNoInvoice = user.permissions.includes('pricing:no-invoice:read');
  const router = useRouter();

  const confirm = useConfirm();
  const [tiers, setTiers] = useState(initialTiers);
  const [prices, setPrices] = useState(initialPrices);
  const [withoutRegime, setWithoutRegime] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [draft, setDraft] = useState({
    maxQty: '',
    markupPct: '',
    notes: '',
  });

  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    maxQty: '',
    markupPct: '',
    notes: '',
  });

  const reloadAbortRef = useRef<AbortController | null>(null);

  const reloadPrices = async (next: boolean): Promise<void> => {
    // Cancel any in-flight reload so rapid toggling doesn't race or surface
    // transient errors from a request that's already been superseded.
    reloadAbortRef.current?.abort();
    const controller = new AbortController();
    reloadAbortRef.current = controller;

    setWithoutRegime(next);
    try {
      const url = next
        ? `/products/${productId}/prices?withoutRegime=true`
        : `/products/${productId}/prices`;
      const fresh = await api<ProductPricesResponse>(url, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPrices(fresh);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      handleApiError(err, { fallback: 'No se pudo recargar precios' });
    }
  };

  if (!prices) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Precios por canal</CardTitle>
          <CardDescription>
            No se pudo calcular precios. Revisá filamentos y precios vigentes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const lastTier = tiers.length > 0 ? tiers[tiers.length - 1] : null;
  const expectedMinQty: number | null =
    lastTier == null ? 1 : lastTier.maxQty == null ? null : lastTier.maxQty + 1;
  const markupCeiling: number | null =
    lastTier == null ? null : (lastTier.markupPct ?? prices.targetMarkupPct);
  const canAppend = expectedMinQty != null;

  const addTier = async () => {
    if (expectedMinQty == null) {
      toast.warning('La última escala cubre infinito. No se pueden agregar más.');
      return;
    }
    const markup = draft.markupPct ? Number(draft.markupPct) : null;
    if (markupCeiling != null) {
      const effective = markup != null ? markup : prices.targetMarkupPct;
      if (effective >= markupCeiling) {
        toast.warning(
          `El markup debe ser menor a ${formatNumber(markupCeiling)}% (escala anterior)`,
        );
        return;
      }
    }
    const maxQty = draft.maxQty ? Number(draft.maxQty) : null;
    if (maxQty != null && maxQty < expectedMinQty) {
      toast.warning(`Hasta debe ser ≥ ${expectedMinQty}`);
      return;
    }

    setCreating(true);
    try {
      await api(`/products/${productId}/tiers`, {
        method: 'POST',
        body: {
          minQty: expectedMinQty,
          maxQty,
          markupPct: markup,
          notes: draft.notes || null,
        },
      });
      setDraft({ maxQty: '', markupPct: '', notes: '' });
      const [tFresh, pFresh] = await Promise.all([
        api<TierDto[]>(`/products/${productId}/tiers`),
        api<ProductPricesResponse>(
          `/products/${productId}/prices${withoutRegime ? '?withoutRegime=true' : ''}`,
        ),
      ]);
      setTiers(tFresh);
      setPrices(pFresh);
      toast.success('Escala creada.');
      router.refresh();
    } catch (err) {
      handleApiError(err);
    } finally {
      setCreating(false);
    }
  };

  const removeTier = async (tierId: string) => {
    const ok = await confirm({
      title: '¿Eliminar escala?',
      confirmLabel: 'Eliminar',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/products/${productId}/tiers/${tierId}`, { method: 'DELETE' });
      const [tFresh, pFresh] = await Promise.all([
        api<TierDto[]>(`/products/${productId}/tiers`),
        api<ProductPricesResponse>(
          `/products/${productId}/prices${withoutRegime ? '?withoutRegime=true' : ''}`,
        ),
      ]);
      setTiers(tFresh);
      setPrices(pFresh);
      toast.success('Escala eliminada.');
    } catch (err) {
      handleApiError(err);
    }
  };

  const startEditTier = (t: TierDto) => {
    setEditingTierId(t.id);
    setEditDraft({
      maxQty: t.maxQty == null ? '' : String(t.maxQty),
      markupPct: t.markupPct == null ? '' : String(t.markupPct),
      notes: t.notes ?? '',
    });
  };

  const cancelEditTier = () => {
    setEditingTierId(null);
  };

  const saveEditTier = async () => {
    if (!editingTierId) return;
    const idx = tiers.findIndex((t) => t.id === editingTierId);
    if (idx === -1) return;
    const tier = tiers[idx];
    if (!tier) return;
    const isLast = idx === tiers.length - 1;
    const prev = idx > 0 ? tiers[idx - 1] : null;
    const next = idx < tiers.length - 1 ? tiers[idx + 1] : null;
    const fallback = prices.targetMarkupPct;

    const markup = editDraft.markupPct.trim() === '' ? null : Number(editDraft.markupPct);
    if (markup != null && Number.isNaN(markup)) {
      toast.warning('Markup inválido');
      return;
    }
    const effective = markup != null ? markup : fallback;
    if (prev) {
      const ceiling = prev.markupPct ?? fallback;
      if (effective >= ceiling) {
        toast.warning(`Markup debe ser menor a ${formatNumber(ceiling)}% (escala anterior)`);
        return;
      }
    }
    if (next) {
      const floor = next.markupPct ?? fallback;
      if (effective <= floor) {
        toast.warning(`Markup debe ser mayor a ${formatNumber(floor)}% (escala siguiente)`);
        return;
      }
    }

    let maxQty: number | null | undefined;
    if (isLast) {
      maxQty = editDraft.maxQty.trim() === '' ? null : Number(editDraft.maxQty);
      if (maxQty != null && Number.isNaN(maxQty)) {
        toast.warning('Hasta inválido');
        return;
      }
      if (maxQty != null && maxQty < tier.minQty) {
        toast.warning(`Hasta debe ser ≥ ${tier.minQty} (o vacío para infinito)`);
        return;
      }
    }

    setSavingEdit(true);
    try {
      const body: Record<string, unknown> = {
        markupPct: markup,
        notes: editDraft.notes.trim() === '' ? null : editDraft.notes,
      };
      if (isLast && maxQty !== undefined) body.maxQty = maxQty;

      await api(`/products/${productId}/tiers/${editingTierId}`, { method: 'PATCH', body });
      const [tFresh, pFresh] = await Promise.all([
        api<TierDto[]>(`/products/${productId}/tiers`),
        api<ProductPricesResponse>(
          `/products/${productId}/prices${withoutRegime ? '?withoutRegime=true' : ''}`,
        ),
      ]);
      setTiers(tFresh);
      setPrices(pFresh);
      setEditingTierId(null);
      toast.success('Escala actualizada.');
      router.refresh();
    } catch (err) {
      handleApiError(err);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle>Precios por canal</CardTitle>
              <CardDescription>
                Costo total: {formatMoney(prices.totalCost ?? prices.costWithProvisions)}
                {prices.fabricationPrice != null && (
                  <>
                    {' '}· Fabricación: {formatMoney(prices.fabricationPrice)}
                  </>
                )}{' '}
                · Markup {formatNumber(prices.targetMarkupPct)}%
              </CardDescription>
              <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Ganancia de bolsillo
                </span>
                <span className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatMoney(prices.profitPerUnit)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  /unidad · igual en todos los canales
                </span>
              </div>
            </div>
            {canSeeNoInvoice && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-warning/10 px-3 py-1.5 text-xs">
                <EyeOff className="h-3.5 w-3.5 text-warning" />
                <span>Efectivo sin régimen</span>
                <input
                  type="checkbox"
                  checked={withoutRegime}
                  onChange={(e) => reloadPrices(e.target.checked)}
                  className="h-3 w-3"
                />
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {prices.channels.length === 0 ? (
            <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              Este producto no tiene canales habilitados. Activá al menos uno desde el editor.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Canal</th>
                  <th className="py-2 pr-4 font-medium">Escala</th>
                  <th className="py-2 pr-4 font-medium">Markup</th>
                  <th className="py-2 pr-4 font-medium">Comisión</th>
                  <th className="py-2 pr-4 font-medium">Régimen</th>
                  <th className="py-2 pr-4 font-medium">Precio</th>
                  <th className="py-2 pr-4 font-medium">Ganancia de bolsillo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {prices.channels.flatMap((c): React.ReactElement[] => {
                  if (c.needsConfig) {
                    return [
                      <tr key={`${c.channelId}-needs`} className="bg-destructive/5">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-1">
                            {c.icon && <span>{c.icon}</span>}
                            <span className="font-medium">{c.channelName}</span>
                          </div>
                        </td>
                        <td colSpan={6} className="py-2 pr-4 text-xs text-destructive">
                          ⚠{' '}
                          {c.channelKind === 'MARKETPLACE'
                            ? 'Cargá la comisión MELI para este producto desde el editor.'
                            : 'Falta configurar este canal.'}
                        </td>
                      </tr>,
                    ];
                  }
                  const rows: React.ReactElement[] = [];
                  if (c.base) {
                    rows.push(
                      <PriceRow
                        key={`${c.channelId}-base`}
                        channel={c}
                        line={c.base}
                        tierLabel="Base"
                      />,
                    );
                  }
                  for (const t of c.tiers) {
                    const range = t.maxQty == null ? `${t.minQty}+` : `${t.minQty}-${t.maxQty}`;
                    rows.push(
                      <PriceRow
                        key={`${c.channelId}-${t.tierId}`}
                        channel={c}
                        line={t.line}
                        tierLabel={range}
                      />,
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Escalas por cantidad</CardTitle>
          <CardDescription>
            Bajan el markup en volumen (ej. 1-4 → 60%, 5-29 → 45%). La ganancia por unidad cambia
            con el markup pero sigue siendo igual entre canales para una misma cantidad.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tiers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin escalas. Todos los canales usan el markup objetivo del producto.
            </p>
          )}
          {tiers.map((t, idx) => {
            const isLast = idx === tiers.length - 1;
            const prev = idx > 0 ? tiers[idx - 1] : null;
            const next = idx < tiers.length - 1 ? tiers[idx + 1] : null;
            const ceiling = prev ? (prev.markupPct ?? prices.targetMarkupPct) : null;
            const floor = next ? (next.markupPct ?? prices.targetMarkupPct) : null;
            const isEditing = editingTierId === t.id;

            if (isEditing && canWrite) {
              return (
                <div
                  key={t.id}
                  className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3"
                >
                  <p className="text-sm font-medium">
                    Editar escala {t.minQty}–{t.maxQty ?? '∞'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Desde</Label>
                      <Input type="number" value={t.minQty} disabled readOnly />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Hasta {isLast ? '(vacío = ∞)' : ''}
                      </Label>
                      {isLast ? (
                        <Input
                          type="number"
                          min={t.minQty}
                          value={editDraft.maxQty}
                          onChange={(e) => setEditDraft({ ...editDraft, maxQty: e.target.value })}
                        />
                      ) : (
                        <Input
                          type="number"
                          value={t.maxQty ?? ''}
                          disabled
                          readOnly
                          title="Determinado por la escala siguiente"
                        />
                      )}
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">
                        Markup % (sobre costo)
                        {(ceiling != null || floor != null) && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            — {floor != null ? `> ${formatNumber(floor)}%` : ''}
                            {floor != null && ceiling != null ? ' y ' : ''}
                            {ceiling != null ? `< ${formatNumber(ceiling)}%` : ''}
                          </span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        placeholder={`hereda producto (${formatNumber(prices.targetMarkupPct)}%)`}
                        value={editDraft.markupPct}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, markupPct: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">Notas</Label>
                      <Input
                        value={editDraft.notes}
                        onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                  {!isLast && (
                    <p className="text-xs text-muted-foreground">
                      El límite superior está fijado por la escala siguiente; eliminá las
                      posteriores si querés cambiarlo.
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEditTier}>
                      <X className="h-4 w-4" />
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={saveEditTier} disabled={savingEdit}>
                      {savingEdit ? <Spinner size="sm" /> : <Check className="h-4 w-4" />}
                      {savingEdit ? 'Guardando…' : 'Guardar'}
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div key={t.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {t.minQty}–{t.maxQty ?? '∞'} unidades
                  </div>
                  <div className="mt-1 font-mono text-xs">
                    markup: {t.markupPct == null ? '—' : `${formatNumber(t.markupPct)}%`}
                  </div>
                  {t.notes && <div className="text-xs text-muted-foreground">{t.notes}</div>}
                </div>
                {canWrite && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEditTier(t)}
                      disabled={editingTierId != null}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTier(t.id)}
                      disabled={!isLast || editingTierId != null}
                      title={isLast ? 'Eliminar' : 'Solo se puede eliminar la última escala'}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {canWrite && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <p className="text-sm font-medium">Nueva escala</p>
              <p className="text-xs text-muted-foreground">
                Las escalas son contiguas: arrancan donde terminó la anterior. Cada escala nueva
                debe tener un markup menor a la previa.
              </p>
              {!canAppend ? (
                <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
                  La última escala ya cubre hasta ∞. Eliminala primero si querés cambiar la cobertura.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Desde</Label>
                      <Input type="number" value={expectedMinQty} disabled readOnly />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Hasta (vacío = ∞)</Label>
                      <Input
                        type="number"
                        min={expectedMinQty}
                        value={draft.maxQty}
                        onChange={(e) => setDraft({ ...draft, maxQty: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">
                        Markup % (sobre costo)
                        {markupCeiling != null && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            — debe ser &lt; {formatNumber(markupCeiling)}%
                          </span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        placeholder={
                          markupCeiling != null
                            ? `menor a ${formatNumber(markupCeiling)}%`
                            : `hereda producto (${formatNumber(prices.targetMarkupPct)}%)`
                        }
                        value={draft.markupPct}
                        onChange={(e) => setDraft({ ...draft, markupPct: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">Notas</Label>
                      <Input
                        value={draft.notes}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={addTier}
                    disabled={creating}
                    className="w-full"
                  >
                    {creating ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
                    {creating ? 'Agregando…' : 'Agregar escala'}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PriceRow({
  channel,
  line,
  tierLabel,
}: {
  channel: ChannelPriceBlock;
  line: PriceLine;
  tierLabel: string;
}) {
  return (
    <tr>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1">
          {channel.icon && <span>{channel.icon}</span>}
          <span className="font-medium">{channel.channelName}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {channel.channelKind.toLowerCase().replace('_', ' ')}
        </div>
      </td>
      <td className="py-2 pr-4 text-xs">{tierLabel}</td>
      <td className="py-2 pr-4 font-mono">{formatNumber(line.markupPct)}%</td>
      <td className="py-2 pr-4 font-mono">
        {formatNumber(line.commissionPct)}%
        {channel.channelKind === 'DIRECT_SALE' && (
          <span className="ml-1 text-[10px] text-muted-foreground">global</span>
        )}
      </td>
      <td className="py-2 pr-4 font-mono text-muted-foreground">
        {formatNumber(line.taxBurdenPct)}%
      </td>
      <td className="py-2 pr-4 font-mono font-semibold">{formatMoney(line.finalPrice)}</td>
      <td
        className="py-2 pr-4 font-mono font-semibold text-emerald-700 dark:text-emerald-300"
        title="Ganancia de bolsillo — profit puro por unidad."
      >
        {formatMoney(line.profit)}
      </td>
    </tr>
  );
}
