'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHasPermission } from '@/components/user-provider';

export type TaxMode = 'SIMPLE' | 'DETAILED';
export type InvoiceType = 'A' | 'B' | 'C' | 'X';
export type ChannelKind = 'DIRECT_SALE' | 'CASH' | 'MARKETPLACE' | 'CUSTOM';

export interface ChannelDto {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  isActive: boolean;
  isSystem: boolean;
  kind: ChannelKind;
  sortOrder: number;
  commissionPct: number;
  withInvoiceDefault: boolean;
  taxMode: TaxMode;
  unifiedRegimePct: number | null;
  iibbPct: number | null;
  appliesIva: boolean;
  defaultInvoiceType: InvoiceType;
  retentionIvaPct: number | null;
  retentionIibbPct: number | null;
  retentionIncomePct: number | null;
  notes: string | null;
}

interface ChannelImpact {
  productsEnabled: number;
  quotesUsing: number;
  sampleProductNames: string[];
}

const KIND_LABEL: Record<ChannelKind, string> = {
  DIRECT_SALE: 'Venta directa',
  CASH: 'Efectivo',
  MARKETPLACE: 'Marketplace',
  CUSTOM: 'Personalizado',
};

const EMPTY: ChannelDto = {
  id: '',
  name: '',
  slug: '',
  icon: null,
  isActive: true,
  isSystem: false,
  kind: 'CUSTOM',
  sortOrder: 0,
  commissionPct: 0,
  withInvoiceDefault: false,
  taxMode: 'SIMPLE',
  unifiedRegimePct: null,
  iibbPct: null,
  appliesIva: false,
  defaultInvoiceType: 'X',
  retentionIvaPct: null,
  retentionIibbPct: null,
  retentionIncomePct: null,
  notes: null,
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ChannelsManager({ initial }: { initial: ChannelDto[] }) {
  const can = useHasPermission();
  const canWrite = can('channel:write');
  const router = useRouter();
  const [channels, setChannels] = useState(initial);
  const [editing, setEditing] = useState<ChannelDto | null>(null);
  const [originalActive, setOriginalActive] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setEditing({ ...EMPTY });
    setOriginalActive(true);
  };
  const startEdit = (c: ChannelDto) => {
    setEditing({ ...c });
    setOriginalActive(c.isActive);
  };

  const save = async () => {
    if (!editing) return;
    setError(null);

    // If the user is deactivating an active channel, surface impact first.
    if (editing.id && originalActive && !editing.isActive) {
      try {
        const impact = await api<ChannelImpact>(`/channels/${editing.id}/impact`);
        const lines: string[] = [];
        if (impact.productsEnabled > 0) {
          const sample = impact.sampleProductNames.slice(0, 3).join(', ');
          const more = impact.productsEnabled > 3 ? ` (y ${impact.productsEnabled - 3} más)` : '';
          lines.push(`• ${impact.productsEnabled} productos lo tienen habilitado: ${sample}${more}`);
          lines.push('  Dejarán de mostrar precios en este canal.');
        }
        if (impact.quotesUsing > 0) {
          lines.push(`• ${impact.quotesUsing} cotizaciones lo referencian (no se modifican).`);
        }
        if (lines.length > 0) {
          const ok = confirm(
            `Vas a desactivar "${editing.name}".\n\n${lines.join('\n')}\n\n¿Continuar?`,
          );
          if (!ok) return;
        }
      } catch {
        // If impact fails, fall back to a generic confirm so the user still has a chance to abort.
        if (!confirm(`Desactivar "${editing.name}"?`)) return;
      }
    }

    setSaving(true);
    try {
      const payload: Partial<ChannelDto> = {
        ...editing,
        slug: editing.id ? editing.slug : slugify(editing.name),
      };
      const result = editing.id
        ? await api<ChannelDto>(`/channels/${editing.id}`, { method: 'PATCH', body: payload })
        : await api<ChannelDto>('/channels', { method: 'POST', body: payload });
      setChannels((list) =>
        editing.id ? list.map((c) => (c.id === result.id ? result : c)) : [...list, result],
      );
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: ChannelDto) => {
    try {
      const impact = await api<ChannelImpact>(`/channels/${c.id}/impact`);
      const summary =
        impact.productsEnabled > 0 || impact.quotesUsing > 0
          ? `Está activo en ${impact.productsEnabled} productos y referenciado por ${impact.quotesUsing} cotizaciones. Si tiene cotizaciones se desactivará en lugar de eliminarse.`
          : 'No está siendo usado.';
      if (!confirm(`¿Eliminar "${c.name}"?\n\n${summary}`)) return;
      await api(`/channels/${c.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" />
            Nuevo canal
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Canal</th>
              <th className="py-2 pr-4 font-medium">Comisión</th>
              <th className="py-2 pr-4 font-medium">Tributario</th>
              <th className="py-2 pr-4 font-medium">Estado</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {channels.map((c) => (
              <tr key={c.id}>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    {c.icon && <span className="text-base">{c.icon}</span>}
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {c.name}
                        {c.isSystem && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                            sistema
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{KIND_LABEL[c.kind]}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4 font-mono">
                  {c.kind === 'DIRECT_SALE' ? (
                    <span className="text-xs text-muted-foreground">global</span>
                  ) : c.kind === 'CASH' ? (
                    <span className="text-xs text-muted-foreground">0% fijo</span>
                  ) : c.kind === 'MARKETPLACE' ? (
                    <span className="text-xs text-muted-foreground">por producto</span>
                  ) : (
                    `${formatNumber(c.commissionPct)}%`
                  )}
                </td>
                <td className="py-3 pr-4 text-xs">
                  {c.taxMode === 'SIMPLE' ? (
                    <span>Simple · régimen global</span>
                  ) : (
                    <span>
                      Detallado · IIBB {formatNumber(c.iibbPct ?? 0)}%
                      {c.appliesIva && ' · IVA 21%'}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={
                      c.isActive
                        ? 'inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs text-success'
                        : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                    }
                  >
                    {c.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {canWrite && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                        Editar
                      </Button>
                      {!c.isSystem && (
                        <Button variant="ghost" size="sm" onClick={() => remove(c)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ChannelDialog
          editing={editing}
          setEditing={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

function ChannelDialog({
  editing,
  setEditing,
  onSave,
  onClose,
  saving,
}: {
  editing: ChannelDto;
  setEditing: (c: ChannelDto) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const isNew = !editing.id;
  const detailed = editing.taxMode === 'DETAILED';
  const showCommissionField = editing.kind === 'CUSTOM';
  const lockedKindReason =
    editing.isSystem
      ? `${KIND_LABEL[editing.kind]} es un canal del sistema. El tipo no se puede cambiar.`
      : !isNew
        ? `Tipo bloqueado para no romper la conexión con productos y cotizaciones.`
        : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card shadow-lg">
        <div className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">
            {isNew ? 'Nuevo canal' : `Editar: ${editing.name}`}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>

            {isNew ? (
              <Field label="Tipo">
                <select
                  value={editing.kind}
                  onChange={(e) => setEditing({ ...editing, kind: e.target.value as ChannelKind })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                >
                  <option value="CUSTOM">Personalizado (comisión propia)</option>
                  <option value="MARKETPLACE">Marketplace (comisión por producto)</option>
                </select>
              </Field>
            ) : (
              <Field label="Tipo">
                <div className="flex h-10 items-center justify-between rounded-md border border-input bg-muted/40 px-3 text-sm">
                  <span>{KIND_LABEL[editing.kind]}</span>
                  {editing.isSystem && (
                    <span className="text-[10px] uppercase tracking-wider text-primary">
                      sistema
                    </span>
                  )}
                </div>
              </Field>
            )}

            <Field label="Orden">
              <Input
                type="number"
                value={editing.sortOrder}
                onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
              />
            </Field>
            <Field label="Ícono (emoji)">
              <Input
                maxLength={4}
                value={editing.icon ?? ''}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value || null })}
              />
            </Field>

            {showCommissionField && (
              <Field label="Comisión del canal (%)">
                <Input
                  type="number"
                  step="any"
                  value={editing.commissionPct}
                  onChange={(e) =>
                    setEditing({ ...editing, commissionPct: Number(e.target.value) })
                  }
                />
              </Field>
            )}
            {editing.kind === 'DIRECT_SALE' && (
              <Field label="Comisión">
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                  Global — editable en Parámetros (direct_sale_commission_pct)
                </div>
              </Field>
            )}
            {editing.kind === 'CASH' && (
              <Field label="Comisión">
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                  0% fijo (regla del sistema)
                </div>
              </Field>
            )}
            {editing.kind === 'MARKETPLACE' && (
              <Field label="Comisión">
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                  Se carga por producto en el editor del producto
                </div>
              </Field>
            )}
          </div>

          {lockedKindReason && (
            <p className="rounded-md border border-muted bg-muted/30 p-2 text-xs text-muted-foreground">
              {lockedKindReason}
            </p>
          )}

          <div className="rounded-md border p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-medium">Modelo tributario</p>
              <div className="inline-flex rounded-md border p-0.5 text-xs">
                <button
                  className={`px-3 py-1 rounded ${editing.taxMode === 'SIMPLE' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setEditing({ ...editing, taxMode: 'SIMPLE' })}
                >
                  Simple
                </button>
                <button
                  className={`px-3 py-1 rounded ${editing.taxMode === 'DETAILED' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setEditing({ ...editing, taxMode: 'DETAILED' })}
                >
                  Detallado
                </button>
              </div>
            </div>

            {!detailed && (
              <p className="text-xs text-muted-foreground">
                Aplica el régimen unificado global (editable en Parámetros). Para cargar IIBB, IVA
                o retenciones por separado pasá a modo detallado.
              </p>
            )}

            {detailed && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="IIBB (%)">
                  <Input
                    type="number"
                    step="any"
                    value={editing.iibbPct ?? 0}
                    onChange={(e) => setEditing({ ...editing, iibbPct: Number(e.target.value) })}
                  />
                </Field>
                <div className="flex items-end">
                  <Checkbox
                    label="Suma IVA 21% al precio final"
                    checked={editing.appliesIva}
                    onChange={(e) => setEditing({ ...editing, appliesIva: e.target.checked })}
                  />
                </div>
                <Field label="Tipo de factura por defecto">
                  <select
                    value={editing.defaultInvoiceType}
                    onChange={(e) =>
                      setEditing({ ...editing, defaultInvoiceType: e.target.value as InvoiceType })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                  >
                    <option value="X">Sin factura</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </Field>
                <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
                  <Field label="Retención IVA (%)">
                    <Input
                      type="number"
                      step="any"
                      value={editing.retentionIvaPct ?? 0}
                      onChange={(e) =>
                        setEditing({ ...editing, retentionIvaPct: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Retención IIBB (%)">
                    <Input
                      type="number"
                      step="any"
                      value={editing.retentionIibbPct ?? 0}
                      onChange={(e) =>
                        setEditing({ ...editing, retentionIibbPct: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Retención Ganancias (%)">
                    <Input
                      type="number"
                      step="any"
                      value={editing.retentionIncomePct ?? 0}
                      onChange={(e) =>
                        setEditing({ ...editing, retentionIncomePct: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {!isNew && (
            <Checkbox
              label="Canal activo"
              checked={editing.isActive}
              onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={onSave} disabled={!editing.name || saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
