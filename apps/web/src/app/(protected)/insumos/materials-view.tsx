'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  Download,
  History,
  Palette,
  Plus,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { formatMoney, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHasPermission } from '@/components/user-provider';
import { MaterialDialog } from './material-dialog';
import { MovementsDialog } from './movements-dialog';
import { PricesDialog } from './prices-dialog';

export type MaterialType = 'FILAMENT' | 'SHEET' | 'PACKAGING' | 'HARDWARE' | 'OTHER';
export type MaterialUnit = 'KG' | 'G' | 'UNIT' | 'REAM' | 'METER' | 'LITER';

export interface MaterialDto {
  id: string;
  name: string;
  sku: string | null;
  type: MaterialType;
  unit: MaterialUnit;
  parentId: string | null;
  brand: string | null;
  color: string | null;
  colorHex: string | null;
  densityGCm3: number | null;
  wastePct: number;
  currentStock: number;
  minStock: number;
  lowStockAlert: boolean;
  notes: string | null;
  imageUrl: string | null;
  isActive: boolean;
  currentPrice: {
    id: string;
    price: number;
    packSize: number | null;
    packPrice: number | null;
    currency: string;
    supplierName: string;
  } | null;
  children?: MaterialDto[];
}

export interface SupplierLite {
  id: string;
  name: string;
  isActive: boolean;
}

const TYPE_LABEL: Record<MaterialType, string> = {
  FILAMENT: 'Filamentos',
  SHEET: 'Hojas',
  PACKAGING: 'Packaging',
  HARDWARE: 'Hardware',
  OTHER: 'Otros',
};

const TABS: Array<{ key: MaterialType | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Todos' },
  { key: 'FILAMENT', label: 'Filamentos' },
  { key: 'SHEET', label: 'Hojas' },
  { key: 'PACKAGING', label: 'Packaging' },
  { key: 'HARDWARE', label: 'Hardware' },
  { key: 'OTHER', label: 'Otros' },
];

interface DialogContext {
  mode: 'create' | 'edit';
  material: MaterialDto | null;
  parent?: MaterialDto;
}

export function MaterialsView({
  initialMaterials,
  suppliers,
}: {
  initialMaterials: MaterialDto[];
  suppliers: SupplierLite[];
}) {
  const can = useHasPermission();
  const canWrite = can('material:write');
  const router = useRouter();
  const [materials, setMaterials] = useState(initialMaterials);
  const [activeTab, setActiveTab] = useState<MaterialType | 'ALL'>('ALL');
  const [dialog, setDialog] = useState<DialogContext | null>(null);
  const [showingPricesFor, setShowingPricesFor] = useState<MaterialDto | null>(null);
  const [showingStockFor, setShowingStockFor] = useState<MaterialDto | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => materials.filter((m) => (activeTab === 'ALL' ? true : m.type === activeTab)),
    [materials, activeTab],
  );

  // Low stock counts only consider stockable rows: non-filament leaves and
  // filament children (variants). Filament parents don't carry stock.
  const lowStockCount = useMemo(() => {
    let count = 0;
    for (const m of materials) {
      if (m.type === 'FILAMENT') {
        for (const child of m.children ?? []) {
          if (child.lowStockAlert && child.currentStock < child.minStock) count++;
        }
      } else if (m.lowStockAlert && m.currentStock < m.minStock) {
        count++;
      }
    }
    return count;
  }, [materials]);

  const upsertMaterial = (m: MaterialDto, isNew: boolean) => {
    setMaterials((list) => {
      if (m.parentId) {
        // Variant: insert into parent's children array.
        return list.map((p) =>
          p.id === m.parentId
            ? {
                ...p,
                children: isNew
                  ? [...(p.children ?? []), m]
                  : (p.children ?? []).map((c) => (c.id === m.id ? m : c)),
              }
            : p,
        );
      }
      // Top-level row
      return isNew ? [...list, m] : list.map((x) => (x.id === m.id ? m : x));
    });
    if (m.parentId) setExpanded((s) => new Set(s).add(m.parentId!));
    setDialog(null);
    router.refresh();
  };

  const handlePricesUpdated = (m: MaterialDto) => {
    setMaterials((list) => list.map((x) => (x.id === m.id ? m : x)));
  };

  const handleStockUpdated = (m: MaterialDto) => {
    setMaterials((list) => {
      if (m.parentId) {
        return list.map((p) =>
          p.id === m.parentId
            ? { ...p, children: (p.children ?? []).map((c) => (c.id === m.id ? m : c)) }
            : p,
        );
      }
      return list.map((x) => (x.id === m.id ? m : x));
    });
  };

  const remove = async (m: MaterialDto) => {
    const label = m.parentId ? 'variante' : 'insumo';
    if (!confirm(`¿Eliminar ${label} "${m.name}"?`)) return;
    try {
      await api(`/materials/${m.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-md border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={
                activeTab === t.key
                  ? 'rounded px-3 py-1.5 text-sm font-medium bg-secondary text-secondary-foreground'
                  : 'rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent'
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/api/reports/stock-snapshot.csv" download>
              <Download className="h-4 w-4" />
              CSV
            </a>
          </Button>
          {canWrite && (
            <Button onClick={() => setDialog({ mode: 'create', material: null })}>
              <Plus className="h-4 w-4" />
              Nuevo insumo
            </Button>
          )}
        </div>
      </div>

      {lowStockCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span>
            <strong>{lowStockCount}</strong> insumo(s) bajo stock mínimo.
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} insumos</CardTitle>
          <CardDescription>
            {activeTab === 'ALL' ? 'Todos los tipos' : TYPE_LABEL[activeTab]}
            {activeTab === 'FILAMENT' || activeTab === 'ALL'
              ? ' · Los filamentos se agrupan por marca; cada color es una variante con su propio stock.'
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Insumo</th>
                <th className="py-2 pr-4 font-medium">Stock</th>
                <th className="py-2 pr-4 font-medium">Desperdicio</th>
                <th className="py-2 pr-4 font-medium">Precio vigente</th>
                <th className="py-2 pr-4 font-medium">Proveedor</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((m) => {
                const isFilamentParent = m.type === 'FILAMENT';
                const children = m.children ?? [];
                const isExpanded = expanded.has(m.id);
                const hasChildren = children.length > 0;
                const lowStock =
                  !isFilamentParent && m.lowStockAlert && m.currentStock < m.minStock;

                return (
                  <FragmentSafe key={m.id}>
                    <tr
                      className={`${isFilamentParent ? 'bg-muted/10' : ''} ${
                        m.isActive ? '' : 'opacity-60'
                      }`}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          {isFilamentParent ? (
                            <button
                              onClick={() => toggleExpand(m.id)}
                              className="text-muted-foreground hover:text-foreground"
                              title={isExpanded ? 'Colapsar' : 'Expandir variantes'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block w-4" />
                          )}
                          <div>
                            <div className="flex items-center gap-2 font-medium">
                              {m.name}
                              {!m.isActive && (
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                  inactivo
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {m.brand && `${m.brand}`}
                              {isFilamentParent && hasChildren
                                ? ` · ${children.length} variante${children.length === 1 ? '' : 's'}`
                                : ''}
                              {isFilamentParent && !hasChildren
                                ? ' · sin variantes'
                                : ''}
                              {m.sku && ` · ${m.sku}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {isFilamentParent ? (
                          <span className="text-xs text-muted-foreground">por variante</span>
                        ) : (
                          <>
                            <div className={lowStock ? 'text-destructive' : ''}>
                              <span className="font-mono">
                                {formatNumber(m.currentStock, 3)}
                              </span>{' '}
                              <span className="text-xs text-muted-foreground">
                                {m.unit.toLowerCase()}
                              </span>
                            </div>
                            {m.minStock > 0 && (
                              <div className="text-xs text-muted-foreground">
                                mín {formatNumber(m.minStock, 3)}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono">{formatNumber(m.wastePct)}%</td>
                      <td className="py-3 pr-4 font-mono">
                        {m.currentPrice ? (
                          <>
                            {formatMoney(m.currentPrice.price, m.currentPrice.currency)}
                            {m.currentPrice.packSize != null &&
                              m.currentPrice.packPrice != null && (
                                <div className="text-[10px] font-normal text-muted-foreground">
                                  {formatMoney(
                                    m.currentPrice.packPrice,
                                    m.currentPrice.currency,
                                  )}{' '}
                                  / {m.currentPrice.packSize} {m.unit.toLowerCase()}
                                </div>
                              )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {m.currentPrice?.supplierName ?? '—'}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {!isFilamentParent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowingStockFor(m)}
                            >
                              <Boxes className="h-4 w-4" />
                              <span className="hidden sm:inline">Stock</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowingPricesFor(m)}
                          >
                            <History className="h-4 w-4" />
                            <span className="hidden sm:inline">Precios</span>
                          </Button>
                          {canWrite && isFilamentParent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDialog({ mode: 'create', material: null, parent: m })
                              }
                              title="Agregar color"
                            >
                              <Palette className="h-4 w-4" />
                              <span className="hidden sm:inline">Color</span>
                            </Button>
                          )}
                          {canWrite && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDialog({ mode: 'edit', material: m })}
                              >
                                Editar
                              </Button>
                              {m.isActive && (
                                <Button variant="ghost" size="sm" onClick={() => remove(m)}>
                                  ✕
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isFilamentParent &&
                      isExpanded &&
                      children.map((c) => {
                        const childLow =
                          c.lowStockAlert && c.currentStock < c.minStock;
                        return (
                          <tr key={c.id} className={`bg-card ${c.isActive ? '' : 'opacity-60'}`}>
                            <td className="py-2 pr-4 pl-8">
                              <div className="flex items-center gap-2">
                                {c.colorHex && (
                                  <span
                                    className="h-4 w-4 shrink-0 rounded-full border"
                                    style={{ backgroundColor: c.colorHex }}
                                  />
                                )}
                                <div>
                                  <div className="flex items-center gap-2 font-medium">
                                    {c.color ?? c.name}
                                    {!c.isActive && (
                                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                        inactivo
                                      </span>
                                    )}
                                  </div>
                                  {c.sku && (
                                    <div className="text-xs text-muted-foreground">
                                      {c.sku}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 pr-4">
                              <div className={childLow ? 'text-destructive' : ''}>
                                <span className="font-mono">
                                  {formatNumber(c.currentStock, 3)}
                                </span>{' '}
                                <span className="text-xs text-muted-foreground">
                                  {c.unit.toLowerCase()}
                                </span>
                              </div>
                              {c.minStock > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  mín {formatNumber(c.minStock, 3)}
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-4 font-mono text-muted-foreground">
                              hereda
                            </td>
                            <td className="py-2 pr-4 font-mono text-muted-foreground">
                              hereda
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">—</td>
                            <td className="py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowingStockFor(c)}
                                >
                                  <Boxes className="h-4 w-4" />
                                  <span className="hidden sm:inline">Stock</span>
                                </Button>
                                {canWrite && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setDialog({ mode: 'edit', material: c, parent: m })
                                      }
                                    >
                                      Editar
                                    </Button>
                                    {c.isActive && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => remove(c)}
                                      >
                                        ✕
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </FragmentSafe>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Sin insumos cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {dialog && (
        <MaterialDialog
          material={dialog.material}
          parent={dialog.parent ?? null}
          onClose={() => setDialog(null)}
          onSaved={upsertMaterial}
        />
      )}
      {showingPricesFor && (
        <PricesDialog
          material={showingPricesFor}
          suppliers={suppliers}
          onClose={() => setShowingPricesFor(null)}
          onMaterialUpdated={(m) => {
            handlePricesUpdated(m);
            setShowingPricesFor(m);
          }}
        />
      )}
      {showingStockFor && (
        <MovementsDialog
          material={showingStockFor}
          onClose={() => setShowingStockFor(null)}
          onMaterialUpdated={(m) => {
            handleStockUpdated(m);
            setShowingStockFor(m);
          }}
        />
      )}
    </div>
  );
}

function FragmentSafe({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
