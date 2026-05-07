'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatMoney, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

export interface ProductLite {
  id: string;
  name: string;
  isActive: boolean;
}

export interface FilamentVariantLite {
  id: string;
  name: string;
  color: string | null;
  colorHex: string | null;
  currentStock: number;
  isActive: boolean;
}

export interface FilamentLite {
  id: string;
  name: string;
  brand: string | null;
  children: FilamentVariantLite[];
}

interface ProductDetail {
  id: string;
  name: string;
  /** From the product's machineId — operational target printer for this product. */
  machineName: string | null;
  pieces: Array<{
    id: string;
    name: string;
    grams: number;
    printMinutes: number;
    defaultFilamentId: string | null;
    defaultFilamentName: string | null;
  }>;
}

interface ConsumptionLine {
  materialId: string;
  materialName: string;
  unit: string;
  recipeQty: number;
  wastePct: number;
  totalQty: number;
}

interface CostingResult {
  costWithProvisions: number;
}

export function NewProductionForm({
  products,
  filaments,
}: {
  products: ProductLite[];
  filaments: FilamentLite[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Index filaments by parent id and by variant id, so we can look up either
  // direction quickly when rendering the per-piece picker.
  const filamentsByParent = useMemo(
    () => new Map(filaments.map((f) => [f.id, f])),
    [filaments],
  );

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      api<ProductDetail>(`/products/${productId}`),
      api<CostingResult>(`/products/${productId}/cost`).catch(() => null),
    ]).then(([prod, cost]) => {
      if (cancelled) return;
      setProduct(prod);
      setUnitCost(cost?.costWithProvisions ?? null);
      // Reset overrides; for each piece auto-pick the only color if the
      // parent has just one variant (saves the user a click).
      const initial: Record<string, string> = {};
      for (const piece of prod.pieces) {
        if (!piece.defaultFilamentId) continue;
        const parent = filaments.find((f) => f.id === piece.defaultFilamentId);
        const onlyChild = parent && parent.children.length === 1 ? parent.children[0] : null;
        if (onlyChild) initial[piece.id] = onlyChild.id;
      }
      setOverrides(initial);
    });
    return () => {
      cancelled = true;
    };
  }, [productId, filaments]);

  const piecesNeedingColor = useMemo(() => {
    if (!product) return [];
    return product.pieces.filter((p) => {
      if (!p.defaultFilamentId) return false;
      const parent = filamentsByParent.get(p.defaultFilamentId);
      return parent && parent.children.length > 0;
    });
  }, [product, filamentsByParent]);

  const allColorsPicked = piecesNeedingColor.every((p) => overrides[p.id]);

  const consumption = useMemo<ConsumptionLine[]>(() => {
    if (!product) return [];
    const totals = new Map<string, number>();
    const qty = Number(quantity || '0');
    for (const piece of product.pieces) {
      const consumedId = overrides[piece.id] ?? piece.defaultFilamentId;
      if (!consumedId) continue;
      totals.set(consumedId, (totals.get(consumedId) ?? 0) + piece.grams * qty);
    }
    const out: ConsumptionLine[] = [];
    for (const [materialId, grams] of totals) {
      // Look up the variant under any parent; show its name + stock.
      let variant: FilamentVariantLite | undefined;
      let parent: FilamentLite | undefined;
      for (const p of filaments) {
        const found = p.children.find((c) => c.id === materialId);
        if (found) {
          variant = found;
          parent = p;
          break;
        }
      }
      const recipeQtyKg = grams / 1000;
      // Waste isn't included in this client-side preview — the server will
      // recompute the authoritative total when the order is created.
      out.push({
        materialId,
        materialName: variant ? `${parent?.name ?? ''} · ${variant.color ?? variant.name}` : materialId,
        unit: 'kg',
        recipeQty: recipeQtyKg,
        wastePct: 0,
        totalQty: recipeQtyKg,
      });
    }
    return out;
  }, [product, overrides, quantity, filaments]);

  const submit = async () => {
    if (!allColorsPicked) {
      toast.warning('Asigná un color a cada pieza antes de crear la orden.');
      return;
    }
    setSaving(true);
    try {
      const created = await api<{ id: string }>('/productions', {
        method: 'POST',
        body: {
          productId,
          quantity: Number(quantity),
          filamentOverrides: Object.keys(overrides).length ? overrides : undefined,
          notes: notes || null,
        },
      });
      toast.success('Orden de producción creada.');
      router.replace(`/produccion/${created.id}`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const totalCost = unitCost != null ? unitCost * Number(quantity || '0') : null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>Producto y cantidad</CardTitle>
              {product?.machineName && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  🖨 {product.machineName}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Producto" required>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cantidad" required>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notas">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        {product && product.pieces.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Color por pieza</CardTitle>
              <CardDescription>
                Elegí qué variante de filamento se consume para cada pieza. El stock se descuenta
                cuando la orden pase a Completada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {product.pieces.map((piece) => {
                const parent = piece.defaultFilamentId
                  ? filamentsByParent.get(piece.defaultFilamentId)
                  : undefined;
                const variants = parent?.children ?? [];
                const selected = overrides[piece.id] ?? '';

                return (
                  <div
                    key={piece.id}
                    className="grid gap-2 rounded-md border p-3 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-5">
                      <div className="font-medium">{piece.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(piece.grams)} g · {formatNumber(piece.printMinutes, 0)} min
                      </div>
                      {parent && (
                        <div className="mt-1 text-xs">
                          <span className="text-muted-foreground">Filamento:</span>{' '}
                          <span className="font-medium">{parent.name}</span>
                        </div>
                      )}
                      {!parent && piece.defaultFilamentName && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {piece.defaultFilamentName}
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-7">
                      {!parent ? (
                        <p className="text-xs text-muted-foreground">
                          Esta pieza no usa filamento jerárquico — se consume directamente del
                          insumo asignado al diseño.
                        </p>
                      ) : variants.length === 0 ? (
                        <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
                          ⚠ {parent.name} no tiene variantes (colores) cargadas. Agregá al menos
                          una desde Insumos antes de fabricar.
                        </p>
                      ) : (
                        <>
                          <Label className="text-xs" required>
                            Color
                          </Label>
                          <select
                            value={selected}
                            onChange={(e) =>
                              setOverrides((o) => ({ ...o, [piece.id]: e.target.value }))
                            }
                            className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                          >
                            <option value="">Elegí color…</option>
                            {variants.map((v) => (
                              <option
                                key={v.id}
                                value={v.id}
                                disabled={!v.isActive}
                              >
                                {v.color ?? v.name} · stock {formatNumber(v.currentStock, 3)} kg
                                {!v.isActive ? ' (inactivo)' : ''}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={!productId || !quantity || saving || !allColorsPicked}
          >
            {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {saving ? 'Creando…' : 'Crear orden'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Costo</CardTitle>
            <CardDescription>Snapshot al crear la orden.</CardDescription>
          </CardHeader>
          <CardContent>
            {unitCost == null ? (
              <p className="text-sm text-muted-foreground">Calculando…</p>
            ) : (
              <>
                <div className="text-2xl font-bold">{formatMoney(totalCost ?? 0)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatMoney(unitCost)} × {quantity}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consumo previsto</CardTitle>
            <CardDescription>Por color elegido. El servidor agrega desperdicio al confirmar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {consumption.length === 0 && (
              <p className="text-muted-foreground">Elegí los colores para ver el consumo.</p>
            )}
            {consumption.map((c) => (
              <div key={c.materialId} className="flex justify-between gap-2 border-b pb-1 last:border-b-0">
                <div className="font-medium">{c.materialName}</div>
                <div className="text-right font-mono">
                  {formatNumber(c.totalQty, 3)} {c.unit}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label required={required}>{label}</Label>
      {children}
    </div>
  );
}
