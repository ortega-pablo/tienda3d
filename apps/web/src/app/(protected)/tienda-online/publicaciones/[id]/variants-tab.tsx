'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  WebAttributeInput,
  WebAvailabilityValue,
  WebColorOptionInput,
  WebProductDto,
  WebVariantDto,
  WebVariantsRegenerateResultDto,
  WebVariantUpdateInput,
} from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { FilamentLine, MemberPieces, SystemProduct, TabProps } from './publication-editor';

const AVAILABILITY: Record<WebAvailabilityValue, string> = {
  MADE_TO_ORDER: 'A pedido',
  STOCK_ONLY: 'Solo stock',
  STOCK_THEN_ORDER: 'Stock y después a pedido',
};

const SALE: Record<
  WebVariantDto['sale']['state'],
  { label: string; variant: 'success' | 'secondary' | 'destructive' }
> = {
  IN_STOCK: { label: 'En stock', variant: 'success' },
  MADE_TO_ORDER: { label: 'A pedido', variant: 'secondary' },
  OUT_OF_STOCK: { label: 'Sin venta', variant: 'destructive' },
};

function Swatch({ hex }: { hex: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border"
      style={{ backgroundColor: hex ?? 'transparent' }}
    />
  );
}

// ─── Miembros ────────────────────────────────────────────────────────────────

function MembersCard({
  product,
  run,
  canWrite,
  systemProducts,
}: TabProps & { systemProducts: SystemProduct[] }) {
  const active = product.members.filter((m) => m.isActive);
  const [optionLabel, setOptionLabel] = useState(product.optionLabel);
  const [rows, setRows] = useState(() =>
    active.map((m) => ({ productId: m.productId, valueLabel: m.valueLabel })),
  );
  const [adding, setAdding] = useState('');
  const taken = new Set(rows.map((r) => r.productId));
  const name = (id: string) => systemProducts.find((p) => p.id === id)?.name ?? id;
  const price = (id: string) => product.members.find((m) => m.productId === id);

  // Las dos escrituras en una sola acción: la tarjeta se rearma con el resultado final.
  const save = () =>
    run(async () => {
      let saved = await api<WebProductDto>(`/web-catalog/products/${product.id}/members`, {
        method: 'PUT',
        body: { members: rows },
      });
      if (optionLabel.trim() && optionLabel.trim() !== saved.optionLabel) {
        saved = await api<WebProductDto>(`/web-catalog/products/${product.id}`, {
          method: 'PATCH',
          body: { optionLabel: optionLabel.trim() },
        });
      }
      return saved;
    }, 'Productos del sistema guardados');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Productos del sistema</CardTitle>
        <CardDescription>
          Cada uno es un tamaño o modelo de la publicación, con su propio precio (Venta Directa).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="v-etiqueta">Cómo se llama la elección</Label>
          <Input
            id="v-etiqueta"
            value={optionLabel}
            onChange={(e) => setOptionLabel(e.target.value)}
            disabled={!canWrite}
            placeholder="Tamaño, Modelo…"
            maxLength={40}
          />
        </div>
        <ul className="space-y-2">
          {rows.map((row, i) => {
            const m = price(row.productId);
            return (
              <li key={row.productId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-48 flex-1 text-sm font-medium">{name(row.productId)}</span>
                <Input
                  aria-label={`Etiqueta de ${name(row.productId)}`}
                  value={row.valueLabel}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x, j) => (j === i ? { ...x, valueLabel: e.target.value } : x)),
                    )
                  }
                  disabled={!canWrite}
                  placeholder="280, 390…"
                  className="h-9 w-36"
                  maxLength={40}
                />
                <span className="w-28 text-right text-sm">
                  {m?.priceState === 'OK' && m.price != null ? (
                    formatMoney(m.price)
                  ) : m ? (
                    <Badge variant="destructive" title={m.priceReason ?? undefined}>
                      Sin precio
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${name(row.productId)}`}
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {product.members
          .filter((m) => m.priceState === 'NO_PRICE' && m.priceReason)
          .map((m) => (
            <p key={m.id} className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {m.productName}: {m.priceReason}
            </p>
          ))}
        {canWrite && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="v-agregar">Agregar producto del sistema</Label>
              <Select id="v-agregar" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Elegí un producto…</option>
                {systemProducts
                  .filter((p) => !taken.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.sku ? ` · ${p.sku}` : ''}
                    </option>
                  ))}
              </Select>
            </div>
            <Button
              variant="outline"
              disabled={!adding}
              onClick={() => {
                setRows((r) => [...r, { productId: adding, valueLabel: '' }]);
                setAdding('');
              }}
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
            <Button onClick={save} disabled={!rows.length}>
              Guardar productos
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Opciones de color ───────────────────────────────────────────────────────

type ColorDraft = {
  id?: string;
  label: string;
  filamentLineId: string;
  colorIds: string[];
  /** null = todas las piezas que usan la línea. */
  pieceIds: string[] | null;
};

function ColorsCard({
  product,
  run,
  canWrite,
  lines,
  memberPieces,
}: TabProps & { lines: FilamentLine[]; memberPieces: MemberPieces[] }) {
  // Línea de cada material (una pieza puede apuntar a un color: dato viejo).
  const lineOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lines) {
      map.set(l.id, l.id);
      for (const c of l.children) map.set(c.id, l.id);
    }
    return map;
  }, [lines]);
  const piecesOfLine = (lineId: string) =>
    memberPieces.flatMap((p) =>
      p.pieces
        .filter((pc) => pc.defaultFilamentId && lineOf.get(pc.defaultFilamentId) === lineId)
        .map((pc) => ({ ...pc, productName: p.name })),
    );
  const [drafts, setDrafts] = useState<ColorDraft[]>(() =>
    product.colorOptions
      .filter((o) => o.isActive)
      .map((o) => {
        const all = piecesOfLine(o.filamentLineId).map((p) => p.id);
        const mine = o.pieces.map((p) => p.id);
        const isAll = all.length === mine.length && all.every((id) => mine.includes(id));
        return {
          id: o.id,
          label: o.label,
          filamentLineId: o.filamentLineId,
          colorIds: o.values.map((v) => v.materialId),
          pieceIds: isAll ? null : mine,
        };
      }),
  );
  const update = (i: number, patch: Partial<ColorDraft>) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const linesInUse = lines.filter((l) => piecesOfLine(l.id).length > 0);

  const save = () => {
    const options: WebColorOptionInput[] = drafts.map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      label: d.label.trim() || 'Color',
      filamentLineId: d.filamentLineId,
      colorIds: d.colorIds,
      ...(d.pieceIds ? { pieceIds: d.pieceIds } : {}),
    }));
    return run(
      () =>
        api<WebProductDto>(`/web-catalog/products/${product.id}/color-options`, {
          method: 'PUT',
          body: { options },
        }),
      'Colores guardados',
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Colores</CardTitle>
        <CardDescription>
          De la línea de filamento con la que se imprimen las piezas, elegí qué colores ofrece la
          tienda. Puede ofrecer 2 aunque se pueda imprimir en 5.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {drafts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin opciones de color: se vende en un solo color.
          </p>
        )}
        {drafts.map((d, i) => {
          const line = lines.find((l) => l.id === d.filamentLineId);
          const pieces = piecesOfLine(d.filamentLineId);
          return (
            <fieldset key={d.id ?? `nuevo-${i}`} className="space-y-3 rounded-md border p-4">
              <legend className="sr-only">Opción de color {i + 1}</legend>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`co-label-${i}`}>Nombre</Label>
                  <Input
                    id={`co-label-${i}`}
                    value={d.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    disabled={!canWrite}
                    className="h-9 w-40"
                    maxLength={40}
                  />
                </div>
                <div className="min-w-56 space-y-1.5">
                  <Label htmlFor={`co-line-${i}`}>Línea de filamento</Label>
                  <Select
                    id={`co-line-${i}`}
                    value={d.filamentLineId}
                    onChange={(e) =>
                      update(i, { filamentLineId: e.target.value, colorIds: [], pieceIds: null })
                    }
                    disabled={!canWrite}
                  >
                    {linesInUse.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar opción de color"
                    onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {line?.children.map((c) => {
                  const checked = d.colorIds.includes(c.id);
                  if (!c.isActive && !checked) return null;
                  return (
                    <span key={c.id} className="inline-flex items-center gap-1.5">
                      <Checkbox
                        checked={checked}
                        disabled={!canWrite || (!c.isActive && !checked)}
                        onChange={(e) =>
                          update(i, {
                            colorIds: e.target.checked
                              ? [...d.colorIds, c.id]
                              : d.colorIds.filter((id) => id !== c.id),
                          })
                        }
                        label={c.color ?? c.name}
                      />
                      <Swatch hex={c.colorHex} />
                      {!c.isActive && <Badge variant="warning">Inactivo en Insumos</Badge>}
                    </span>
                  );
                })}
              </div>
              {pieces.length > 1 && (
                <div className="space-y-2 text-sm">
                  <Checkbox
                    checked={d.pieceIds === null}
                    disabled={!canWrite}
                    onChange={(e) =>
                      update(i, { pieceIds: e.target.checked ? null : pieces.map((p) => p.id) })
                    }
                    label="Pinta todas las piezas que usan esta línea"
                  />
                  {d.pieceIds !== null && (
                    <div className="flex flex-wrap gap-x-5 gap-y-2 pl-6">
                      {pieces.map((p) => (
                        <Checkbox
                          key={p.id}
                          checked={d.pieceIds!.includes(p.id)}
                          disabled={!canWrite}
                          onChange={(e) =>
                            update(i, {
                              pieceIds: e.target.checked
                                ? [...d.pieceIds!, p.id]
                                : d.pieceIds!.filter((id) => id !== p.id),
                            })
                          }
                          label={`${p.productName} · ${p.name}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          );
        })}
        {canWrite && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={!linesInUse.length}
              onClick={() =>
                setDrafts((x) => [
                  ...x,
                  {
                    label: 'Color',
                    filamentLineId: linesInUse[0]!.id,
                    colorIds: [],
                    pieceIds: null,
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Agregar opción de color
            </Button>
            <Button onClick={save} disabled={drafts.some((d) => !d.colorIds.length)}>
              Guardar colores
            </Button>
          </div>
        )}
        {!linesInUse.length && (
          <p className="text-sm text-muted-foreground">
            Agregá primero los productos del sistema: las líneas salen de sus piezas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Opciones informativas ───────────────────────────────────────────────────

function AttributesCard({ product, run, canWrite }: TabProps) {
  const [drafts, setDrafts] = useState(() =>
    product.attributes
      .filter((a) => a.isActive)
      .map((a) => ({
        id: a.id as string | undefined,
        label: a.label,
        values: a.values
          .filter((v) => v.isActive)
          .map((v) => ({ id: v.id as string | undefined, label: v.label })),
      })),
  );
  const update = (i: number, patch: Partial<(typeof drafts)[number]>) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () => {
    const attributes: WebAttributeInput[] = drafts.map((a) => ({
      ...(a.id ? { id: a.id } : {}),
      label: a.label.trim(),
      values: a.values
        .filter((v) => v.label.trim())
        .map((v) => ({ ...(v.id ? { id: v.id } : {}), label: v.label.trim() })),
    }));
    return run(
      () =>
        api<WebProductDto>(`/web-catalog/products/${product.id}/attributes`, {
          method: 'PUT',
          body: { attributes },
        }),
      'Opciones guardadas',
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opciones informativas</CardTitle>
        <CardDescription>
          Por ejemplo &quot;Tipo de hoja: Cuadro / Punto&quot;. Generan variantes con el mismo
          precio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.map((a, i) => (
          <fieldset key={a.id ?? `nuevo-${i}`} className="space-y-2 rounded-md border p-4">
            <legend className="sr-only">Opción {a.label}</legend>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`at-${i}`}>Nombre</Label>
                <Input
                  id={`at-${i}`}
                  value={a.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  disabled={!canWrite}
                  className="h-9 w-48"
                  maxLength={40}
                />
              </div>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${a.label}`}
                  onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {a.values.map((v, j) => (
                <Input
                  key={v.id ?? `v-${j}`}
                  aria-label={`Valor ${j + 1} de ${a.label}`}
                  value={v.label}
                  onChange={(e) =>
                    update(i, {
                      values: a.values.map((x, k) =>
                        k === j ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                  disabled={!canWrite}
                  className="h-9 w-36"
                  maxLength={60}
                />
              ))}
              {canWrite && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => update(i, { values: [...a.values, { id: undefined, label: '' }] })}
                >
                  <Plus className="h-4 w-4" />
                  Valor
                </Button>
              )}
            </div>
          </fieldset>
        ))}
        {canWrite && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDrafts((d) => [
                  ...d,
                  { id: undefined, label: '', values: [{ id: undefined, label: '' }] },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Agregar opción
            </Button>
            <Button
              onClick={save}
              disabled={drafts.some(
                (a) => !a.label.trim() || !a.values.some((v) => v.label.trim()),
              )}
            >
              Guardar opciones
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Variantes ───────────────────────────────────────────────────────────────

function VariantRow({
  variant,
  run,
  canWrite,
}: { variant: WebVariantDto } & Pick<TabProps, 'run' | 'canWrite'>) {
  const [stock, setStock] = useState(String(variant.stockQuantity));
  const [max, setMax] = useState(variant.maxPerOrder == null ? '' : String(variant.maxPerOrder));
  const [lead, setLead] = useState(
    variant.leadTimeDays == null ? '' : String(variant.leadTimeDays),
  );
  const patch = (body: WebVariantUpdateInput, success: string) =>
    run(
      () => api<WebProductDto>(`/web-catalog/variants/${variant.id}`, { method: 'PATCH', body }),
      success,
    );
  const optionalInt = (value: string) => (value.trim() === '' ? null : Number(value));
  const sale = SALE[variant.sale.state];

  return (
    <tr className={variant.isActive ? '' : 'opacity-60'}>
      <td className="py-2 pr-3 font-mono text-xs">{variant.sku}</td>
      <td className="py-2 pr-3 text-sm">
        <span className="flex flex-wrap items-center gap-1.5">
          {variant.memberLabel}
          {variant.options.map((o) => (
            <span key={`${o.optionId}-${o.valueId}`} className="inline-flex items-center gap-1">
              · {o.kind === 'color' && <Swatch hex={o.colorHex} />}
              {o.label}
            </span>
          ))}
        </span>
      </td>
      <td className="py-2 pr-3">
        <Switch
          aria-label={`${variant.sku} a la venta`}
          checked={variant.isActive}
          disabled={!canWrite}
          onCheckedChange={(isActive) =>
            patch({ isActive }, isActive ? 'Variante a la venta' : 'Variante pausada')
          }
        />
      </td>
      <td className="py-2 pr-3">
        <Select
          aria-label={`Disponibilidad de ${variant.sku}`}
          value={variant.availability}
          disabled={!canWrite}
          onChange={(e) =>
            patch(
              { availability: e.target.value as WebAvailabilityValue },
              'Disponibilidad guardada',
            )
          }
          className="w-52 [&_select]:h-9"
        >
          {Object.entries(AVAILABILITY).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </td>
      <td className="py-2 pr-3">
        <Input
          aria-label={`Stock de ${variant.sku}`}
          type="number"
          min={0}
          value={stock}
          disabled={!canWrite || variant.availability === 'MADE_TO_ORDER'}
          onChange={(e) => setStock(e.target.value)}
          onBlur={() =>
            Number(stock) !== variant.stockQuantity &&
            patch({ stockQuantity: Number(stock) || 0 }, 'Stock guardado')
          }
          className="h-9 w-20"
        />
      </td>
      <td className="py-2 pr-3">
        <Input
          aria-label={`Máximo por pedido de ${variant.sku}`}
          type="number"
          min={1}
          placeholder="20"
          value={max}
          disabled={!canWrite}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() =>
            optionalInt(max) !== variant.maxPerOrder &&
            patch({ maxPerOrder: optionalInt(max) }, 'Máximo guardado')
          }
          className="h-9 w-20"
        />
      </td>
      <td className="py-2 pr-3">
        <Input
          aria-label={`Plazo en días de ${variant.sku}`}
          type="number"
          min={0}
          value={lead}
          disabled={!canWrite}
          onChange={(e) => setLead(e.target.value)}
          onBlur={() =>
            optionalInt(lead) !== variant.leadTimeDays &&
            patch({ leadTimeDays: optionalInt(lead) }, 'Plazo guardado')
          }
          className="h-9 w-20"
        />
      </td>
      <td className="py-2">
        <Badge variant={sale.variant}>{sale.label}</Badge>
        {variant.pausedByAdmin && (
          <span className="ml-1 text-xs text-muted-foreground">(pausada)</span>
        )}
      </td>
    </tr>
  );
}

function VariantsCard({ product, run, canWrite }: TabProps) {
  const regenerate = () =>
    run(async () => {
      const result = await api<WebVariantsRegenerateResultDto>(
        `/web-catalog/products/${product.id}/variants/regenerate`,
        { method: 'POST' },
      );
      toast.info(
        `${result.created} nuevas · ${result.kept} sin cambios · ${result.reactivated} reactivadas · ${result.deactivated} desactivadas`,
      );
      return result.product;
    }, 'Variantes generadas');
  const variants = product.variants;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              Variantes ({variants.filter((v) => v.isActive).length} a la venta)
            </CardTitle>
            <CardDescription>
              Cada combinación vendible, con su SKU. Regenerar conserva los SKU, crea las nuevas y
              saca de venta las que ya no corresponden; respeta las que pausaste a mano.
            </CardDescription>
          </div>
          {canWrite && (
            <Button variant="outline" onClick={regenerate}>
              <RefreshCw className="h-4 w-4" />
              Generar variantes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay variantes: guardá productos y colores y tocá &quot;Generar
            variantes&quot;.
          </p>
        ) : (
          <table className="w-full min-w-[900px] text-left">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">SKU</th>
                <th className="pb-2 font-medium">Combinación</th>
                <th className="pb-2 font-medium">A la venta</th>
                <th className="pb-2 font-medium">Disponibilidad</th>
                <th className="pb-2 font-medium">Stock</th>
                <th className="pb-2 font-medium">Máx.</th>
                <th className="pb-2 font-medium">Plazo (días)</th>
                <th className="pb-2 font-medium">Hoy</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {variants.map((v) => (
                <VariantRow key={v.id} variant={v} run={run} canWrite={canWrite} />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function VariantsTab(
  props: TabProps & {
    systemProducts: SystemProduct[];
    lines: FilamentLine[];
    memberPieces: MemberPieces[];
  },
) {
  // Las tarjetas se rearman con lo guardado (por ejemplo, ids de opciones nuevas).
  const memberKey =
    props.product.optionLabel +
    props.product.members.map((m) => `${m.productId}:${m.isActive}:${m.valueLabel}`).join();
  const colorKey = props.product.colorOptions.map((o) => o.id).join();
  const attrKey = props.product.attributes.map((a) => a.id).join();
  return (
    <div className="space-y-6">
      <MembersCard key={memberKey} {...props} />
      <ColorsCard key={`${colorKey}|${memberKey}`} {...props} />
      <AttributesCard key={attrKey} {...props} />
      <VariantsCard {...props} />
    </div>
  );
}
