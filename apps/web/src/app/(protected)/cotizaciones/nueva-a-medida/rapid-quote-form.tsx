'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

export interface FilamentLite {
  id: string;
  name: string;
}
export interface CustomerOption {
  id: string;
  name: string;
  type: 'STANDARD' | 'WHOLESALE' | 'CONSIGNMENT' | 'SPECIAL';
  email: string | null;
  phone: string | null;
  isActive: boolean;
  skipChannelCommission: boolean;
  skipMarketing: boolean;
  skipRegime: boolean;
  skipReinvestment: boolean;
}

export interface MaterialLite {
  id: string;
  name: string;
  type: 'FILAMENT' | 'SHEET' | 'PACKAGING' | 'HARDWARE' | 'OTHER';
  unit: string;
  isActive: boolean;
}

interface PieceDraft {
  name: string;
  grams: string;
  printMinutes: string;
  filamentId: string;
  /**
   * Id del grupo al que pertenece la pieza. En modo ADHOC libre, el
   * vendedor puede crear varios grupos y asignar piezas a uno u otro
   * para que cada grupo cotice como un item separado. Si la pieza queda
   * con un `groupId` que ya no existe (porque el vendedor borró el
   * grupo), el builder la trata como huérfana y la mete en un grupo
   * adicional automático al guardar.
   */
  groupId: string;
}
interface MaterialDraft {
  materialId: string;
  quantity: string;
  groupId: string;
}

/**
 * Cada grupo termina siendo un ADHOC item en la cotización. El motor
 * calcula y costea cada grupo por separado. El grupo NO se persiste como
 * entidad — solo se usa para particionar el payload en N items al
 * guardar.
 *
 * `designMinutes` queda fuera de los grupos: es cargo único del proyecto
 * entero (un solo modelo 3D, se cobra una sola vez). El builder lo
 * asigna al primer grupo no vacío.
 */
interface GroupDraft {
  id: string;
  name: string;
  quantity: string;
  assemblyMinutes: string;
  managementMinutes: string;
}

/** Id estable del grupo default — siempre existe al arrancar el form. */
const DEFAULT_GROUP_ID = 'g1';

interface Preview {
  unitCost: number;
  unitPrice: number;
  unitProfit: number;
  lineTotal: number;
  designSurcharge: number;
}

export interface KeychainTierLite {
  id: string;
  minQty: number;
  maxQty: number | null;
  markupPct: number;
}

export interface KeychainDefaultsLite {
  pieceName: string;
  pieceGrams: number;
  piecePrintMinutes: number;
  pieceFilamentId: string | null;
  assemblyMinutes: number;
  managementMinutes: number;
  materials: Array<{ materialId: string; quantity: number; sortOrder: number }>;
}

interface KeychainMatrixRow {
  tierId: string;
  tierLabel: string;
  minQty: number;
  maxQty: number | null;
  markupPct: number;
  unitPrice: number;
  unitProfit: number;
  lineTotal: number;
  designSurcharge: number;
}

/**
 * Form compartido entre "cotización a medida" libre y "cotización de
 * llaveros en cantidad". El modo se controla con `mode`:
 *
 *   - 'adhoc'    : cantidad libre (input numérico), sin tier override.
 *   - 'keychain' : cantidad en grilla fija (1..4 o múltiplo de 5),
 *                  con badge de tier aplicada y `templateKind: 'KEYCHAIN'`
 *                  en el payload para que el backend valide + aplique el
 *                  markup de la tier seedeada en `keychain_tiers`.
 *
 * El canal no es seleccionable: por default cotiza contra Venta Directa
 * (`ventaDirectaId`), y cuando el usuario tilda "Operación sin factura"
 * el canal pasa a Efectivo (`efectivoId`). Los ids se hidratan del
 * server-side al cargar la página.
 */
export function RapidQuoteForm({
  filaments,
  nonFilaments,
  customers,
  ventaDirectaId,
  efectivoId,
  mode = 'adhoc',
  keychainTiers = [],
  batchSize = 1,
  keychainDefaults,
}: {
  filaments: FilamentLite[];
  nonFilaments: MaterialLite[];
  customers: CustomerOption[];
  ventaDirectaId: string;
  efectivoId: string;
  mode?: 'adhoc' | 'keychain';
  keychainTiers?: KeychainTierLite[];
  /**
   * Tamaño del batch para modo keychain. Si > 1, los labels/help-text
   * indican que los inputs se cargan como totales para `batchSize`
   * llaveros (el backend divide al costear). Default 1 = comportamiento
   * legacy (per-unidad).
   */
  batchSize?: number;
  /**
   * Valores default que el vendedor ve precargados al abrir el form en
   * modo keychain (pieza, insumos, tiempos). Editable en
   * `/parametros/llaveros`. Si está ausente o el modo es 'adhoc', el
   * form arranca con el placeholder genérico ("Pieza" vacía).
   */
  keychainDefaults?: KeychainDefaultsLite;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', notes: '' });
  // Sin tildar = con factura = Venta Directa. Tildado = sin factura = Efectivo.
  const [withoutInvoice, setWithoutInvoice] = useState(false);
  const channelId = withoutInvoice ? efectivoId : ventaDirectaId;

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const onCustomerChange = (id: string) => {
    setCustomerId(id);
    setPreview(null);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setCustomer({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', notes: '' });
    } else {
      setCustomer({ name: '', email: '', phone: '', notes: '' });
    }
  };
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');

  const isKeychain = mode === 'keychain';
  // Cuando estamos en modo keychain y el admin configuró batch > 1, los
  // inputs (gramos, minutos, consumos) se cargan como totales para
  // `batchSize` unidades. Lo usamos en los labels y en la línea de
  // "costo por unidad" del preview.
  const usesBatchInputs = isKeychain && batchSize > 1;
  const batchSuffix = usesBatchInputs ? ` (para ${batchSize} llaveros)` : '';
  const [description, setDescription] = useState(
    isKeychain ? 'Llavero personalizado' : 'Pieza a medida',
  );
  // `quantity`, `assemblyMinutes`, `managementMinutes` viven en `groups[0]`
  // (definido más abajo). Los alias para retro-compatibilidad del render
  // se exponen después de declarar `groups`.
  // Pre-carga en modo keychain: tomamos los defaults configurados en
  // `/parametros/llaveros` (pieza, insumos, tiempos). En modo ADHOC libre
  // arrancamos con el placeholder vacío de siempre. El vendedor puede
  // editar/quitar/agregar lo que quiera.
  const initialPieces: PieceDraft[] = useMemo(() => {
    if (isKeychain && keychainDefaults) {
      return [
        {
          name: keychainDefaults.pieceName || 'Llavero',
          grams: keychainDefaults.pieceGrams > 0 ? String(keychainDefaults.pieceGrams) : '',
          printMinutes:
            keychainDefaults.piecePrintMinutes > 0
              ? String(keychainDefaults.piecePrintMinutes)
              : '',
          filamentId:
            keychainDefaults.pieceFilamentId ?? filaments[0]?.id ?? '',
          groupId: DEFAULT_GROUP_ID,
        },
      ];
    }
    return [
      {
        name: 'Pieza',
        grams: '',
        printMinutes: '',
        filamentId: filaments[0]?.id ?? '',
        groupId: DEFAULT_GROUP_ID,
      },
    ];
    // Solo corre una vez al montar — el form es controlado a partir de ahí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const initialMaterials: MaterialDraft[] = useMemo(() => {
    if (isKeychain && keychainDefaults) {
      return keychainDefaults.materials.map((m) => ({
        materialId: m.materialId,
        quantity: String(m.quantity),
        groupId: DEFAULT_GROUP_ID,
      }));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pieces, setPieces] = useState<PieceDraft[]>(initialPieces);
  const [materials, setMaterials] = useState<MaterialDraft[]>(initialMaterials);

  /**
   * Grupos del form. El grupo default `g1` siempre existe — backs los
   * campos cantidad / armado / gestión cuando no hay multi-grupo. En
   * modo keychain queda fijo en 1 (la grilla de tiers no soporta grupos).
   */
  const [groups, setGroups] = useState<GroupDraft[]>([
    {
      id: DEFAULT_GROUP_ID,
      name: isKeychain ? 'Llavero' : 'Grupo 1',
      quantity: '1',
      assemblyMinutes:
        isKeychain && keychainDefaults ? String(keychainDefaults.assemblyMinutes) : '0',
      managementMinutes:
        isKeychain && keychainDefaults ? String(keychainDefaults.managementMinutes) : '0',
    },
  ]);
  const [designMinutes, setDesignMinutes] = useState('0');

  // Atajos al primer grupo: en single-group (default) este es EL grupo,
  // y la UI usa estos getters/setters directos en lugar de los del array.
  const firstGroup = groups[0]!;
  const setFirstGroup = (patch: Partial<GroupDraft>) => {
    setGroups((arr) => arr.map((g, i) => (i === 0 ? { ...g, ...patch } : g)));
  };
  // Alias legibles para minimizar el diff en el render existente.
  const quantity = firstGroup.quantity;
  const setQuantity = (v: string) => setFirstGroup({ quantity: v });
  const assemblyMinutes = firstGroup.assemblyMinutes;
  const setAssemblyMinutes = (v: string) => setFirstGroup({ assemblyMinutes: v });
  const managementMinutes = firstGroup.managementMinutes;
  const setManagementMinutes = (v: string) => setFirstGroup({ managementMinutes: v });

  // ----- Helpers de multi-grupo (solo modo ADHOC; keychain queda en 1) -----
  const hasMultipleGroups = !isKeychain && groups.length > 1;
  const addGroup = () => {
    if (isKeychain) return;
    setGroups((arr) => {
      const nextNumber = arr.length + 1;
      const newId = `g${nextNumber}_${Date.now()}`;
      return [
        ...arr,
        {
          id: newId,
          name: `Grupo ${nextNumber}`,
          quantity: '1',
          assemblyMinutes: '0',
          managementMinutes: '0',
        },
      ];
    });
  };
  const updateGroup = (id: string, patch: Partial<GroupDraft>) => {
    setGroups((arr) => arr.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };
  /**
   * Borra un grupo. Las piezas e insumos asignados a ese grupo quedan
   * con un `groupId` huérfano — el builder los recoge en el "grupo
   * adicional" al guardar (Fase 2). El primer grupo nunca se borra:
   * siempre hay al menos uno.
   */
  const removeGroup = (id: string) => {
    if (id === groups[0]?.id) return;
    setGroups((arr) => arr.filter((g) => g.id !== id));
  };

  // Tier activa según la cantidad — solo para modo keychain. Si no cae
  // dentro de la grilla, devuelve null y deshabilitamos el submit.
  // La cantidad de keychain siempre vive en el primer (y único) grupo.
  const activeKeychainTier = isKeychain
    ? (keychainTiers.find(
        (t) => Number(quantity) >= t.minQty && (t.maxQty == null || Number(quantity) <= t.maxQty),
      ) ?? null)
    : null;

  const [preview, setPreview] = useState<Preview | 'loading' | 'error' | null>(null);
  const [matrix, setMatrix] = useState<KeychainMatrixRow[] | 'loading' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);

  const buildItem = () => ({
    type: 'ADHOC' as const,
    description: description || (isKeychain ? 'Llavero personalizado' : 'Pieza a medida'),
    quantity: Number(quantity || '1'),
    payload: {
      pieces: pieces
        .filter((p) => p.filamentId)
        .map((p) => ({
          name: p.name,
          grams: Number(p.grams || '0'),
          printMinutes: Number(p.printMinutes || '0'),
          filamentId: p.filamentId,
        })),
      materials: materials
        .filter((m) => m.materialId)
        .map((m) => ({ materialId: m.materialId, quantity: Number(m.quantity || '1') })),
      assemblyMinutes: Number(assemblyMinutes || '0'),
      managementMinutes: Number(managementMinutes || '0'),
      designMinutes: Number(designMinutes || '0'),
      ...(isKeychain ? { templateKind: 'KEYCHAIN' as const } : {}),
    },
  });

  const calc = async () => {
    setPreview('loading');
    if (isKeychain) setMatrix('loading');
    try {
      const item = buildItem();
      const result = await api<Preview>('/quotes/preview-item', {
        method: 'POST',
        body: {
          channelId,
          customerId: customerId || null,
          item,
        },
      });
      setPreview(result);
      // En modo keychain, además del precio para la cantidad elegida
      // traemos la matriz comparativa de todos los tiers — para que el
      // vendedor vea el incentivo de saltar de escala.
      if (isKeychain) {
        try {
          const m = await api<{ tiers: KeychainMatrixRow[] }>('/quotes/keychain-matrix', {
            method: 'POST',
            body: {
              channelId,
              customerId: customerId || null,
              payload: item.payload,
            },
          });
          setMatrix(m.tiers);
        } catch {
          setMatrix('error');
        }
      }
    } catch (err) {
      setPreview('error');
      if (isKeychain) setMatrix('error');
      handleApiError(err, { fallback: 'Error al calcular' });
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const created = await api<{ id: string }>('/quotes', {
        method: 'POST',
        body: {
          customerId: customerId || null,
          customerName: customer.name,
          customerEmail: customer.email || null,
          customerPhone: customer.phone || null,
          customerNotes: customer.notes || null,
          channelId,
          withInvoice: !withoutInvoice,
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          notes: notes || null,
          discount: Number(discount || '0'),
          items: [buildItem()],
        },
      });
      toast.success('Cotización a medida creada.');
      router.replace(`/cotizaciones/${created.id}`);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const setPiece = (idx: number, patch: Partial<PieceDraft>) => {
    setPieces((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  };
  const setMaterial = (idx: number, patch: Partial<MaterialDraft>) => {
    setMaterials((arr) => {
      const next = [...arr];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  };

  const lineTotal = preview && typeof preview === 'object' ? preview.lineTotal : 0;
  const total = Math.max(lineTotal - Number(discount || '0'), 0);

  const qtyNumber = Number(quantity || '0');
  const isQtyValid = isKeychain
    ? Number.isInteger(qtyNumber) &&
      qtyNumber >= 1 &&
      (qtyNumber < 5 || qtyNumber % 5 === 0) &&
      activeKeychainTier != null
    : qtyNumber > 0;
  const isFormValid =
    customer.name.trim().length > 0 &&
    isQtyValid &&
    description.trim().length > 0 &&
    pieces.some((p) => p.filamentId && Number(p.grams || '0') > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
            {selectedCustomer && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {selectedCustomer.type === 'WHOLESALE'
                    ? 'Mayorista'
                    : selectedCustomer.type === 'CONSIGNMENT'
                      ? 'Consignación'
                      : selectedCustomer.type === 'SPECIAL'
                        ? 'Especial'
                        : 'Estándar'}
                </span>
                {selectedCustomer.skipChannelCommission && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin comisión
                  </span>
                )}
                {selectedCustomer.skipMarketing && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin marketing
                  </span>
                )}
                {selectedCustomer.skipRegime && (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    Sin régimen
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {customers.length > 0 && (
              <div className="sm:col-span-2">
                <Field label="Cliente registrado (opcional)">
                  <select
                    value={customerId}
                    onChange={(e) => onCustomerChange(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                  >
                    <option value="">— Sin cliente registrado (walk-in) —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <Field label="Cliente" required>
              <Input
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                disabled={!!selectedCustomer}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              />
            </Field>
            <Field label="Válida hasta">
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </Field>
            <Field label="Descuento ($)">
              <Input
                type="number"
                step="any"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 rounded-md border bg-muted/20 p-3">
              <Checkbox
                label="Operación sin factura"
                checked={withoutInvoice}
                onChange={(e) => {
                  setWithoutInvoice(e.target.checked);
                  setPreview(null); // invalida preview previa
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {withoutInvoice
                  ? 'Aplica el canal Efectivo (sin IVA ni régimen).'
                  : 'Aplica el canal Venta Directa (con régimen unificado).'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notas">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Pieza / servicio a cotizar
                </CardTitle>
                <CardDescription>
                  {hasMultipleGroups
                    ? 'Cada grupo se cotiza como un item separado en la cotización.'
                    : 'Una pieza con uno o varios componentes impresos. Para servicios, dejá las piezas vacías y completá solo los minutos de mano de obra.'}
                </CardDescription>
              </div>
              {!isKeychain && (
                <Button variant="outline" size="sm" onClick={addGroup}>
                  <Plus className="h-3 w-3" /> Agregar grupo
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-12">
              <div className={hasMultipleGroups ? 'sm:col-span-12' : 'sm:col-span-9'}>
                <Field label="Descripción" required>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Llavero personalizado"
                  />
                </Field>
              </div>
              {!hasMultipleGroups && (
                <div className="sm:col-span-3">
                  <Field label="Cantidad" required>
                    {isKeychain ? (
                      <KeychainQtySelect
                        value={quantity}
                        onChange={setQuantity}
                        tiers={keychainTiers}
                      />
                    ) : (
                      <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              )}
            </div>

            {hasMultipleGroups && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Grupos</p>
                <div className="space-y-2">
                  {groups.map((g, idx) => (
                    <div
                      key={g.id}
                      className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-12"
                    >
                      <div className="sm:col-span-4">
                        <Label className="text-xs">Nombre del grupo</Label>
                        <Input
                          value={g.name}
                          onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                          placeholder={`Grupo ${idx + 1}`}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs" required>
                          Cantidad
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          value={g.quantity}
                          onChange={(e) => updateGroup(g.id, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Armado (min)</Label>
                        <Input
                          type="number"
                          value={g.assemblyMinutes}
                          onChange={(e) =>
                            updateGroup(g.id, { assemblyMinutes: e.target.value })
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Gestión (min)</Label>
                        <Input
                          type="number"
                          value={g.managementMinutes}
                          onChange={(e) =>
                            updateGroup(g.id, { managementMinutes: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-end justify-end sm:col-span-2">
                        {idx > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeGroup(g.id)}
                            title="Eliminar grupo"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Las piezas e insumos huérfanos (asignados a un grupo que ya no existe) caen
                  en un "Grupo adicional" automático al guardar.
                </p>
              </div>
            )}
            {isKeychain && activeKeychainTier && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs">
                <span className="font-medium">
                  Tier aplicado:{' '}
                  {activeKeychainTier.maxQty == null
                    ? `${activeKeychainTier.minQty}+`
                    : `${activeKeychainTier.minQty}-${activeKeychainTier.maxQty}`}
                </span>
                <span className="text-muted-foreground">
                  Markup {activeKeychainTier.markupPct}% sobre fabricación
                </span>
              </div>
            )}
            {isKeychain && !activeKeychainTier && qtyNumber > 0 && (
              <p className="text-xs text-destructive">
                La cantidad {qtyNumber} no cae en ninguna tier. Usá 1-4 o un múltiplo de 5.
              </p>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Componentes impresos{batchSuffix}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPieces((arr) => [
                      ...arr,
                      {
                        name: 'Pieza',
                        grams: '',
                        printMinutes: '',
                        filamentId: filaments[0]?.id ?? '',
                        // Las piezas nuevas arrancan en el primer grupo
                        // disponible. El vendedor las reasigna después si quiere.
                        groupId: groups[0]?.id ?? DEFAULT_GROUP_ID,
                      },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" /> Componente
                </Button>
              </div>
              {pieces.map((p, idx) => (
                <div key={idx} className="mb-2 grid gap-2 rounded border p-2 sm:grid-cols-12">
                  <div className={hasMultipleGroups ? 'sm:col-span-3' : 'sm:col-span-4'}>
                    <Label className="text-xs">Nombre</Label>
                    <Input value={p.name} onChange={(e) => setPiece(idx, { name: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs" required>
                      Gramos
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      value={p.grams}
                      onChange={(e) => setPiece(idx, { grams: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Min impr.</Label>
                    <Input
                      type="number"
                      step="any"
                      value={p.printMinutes}
                      onChange={(e) => setPiece(idx, { printMinutes: e.target.value })}
                    />
                  </div>
                  <div className={hasMultipleGroups ? 'sm:col-span-2' : 'sm:col-span-3'}>
                    <Label className="text-xs" required>
                      Filamento
                    </Label>
                    <select
                      value={p.filamentId}
                      onChange={(e) => setPiece(idx, { filamentId: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    >
                      {filaments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {hasMultipleGroups && (
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Grupo</Label>
                      <select
                        value={p.groupId}
                        onChange={(e) => setPiece(idx, { groupId: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-end justify-end sm:col-span-1">
                    {pieces.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPieces((arr) => arr.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Insumos extra{batchSuffix}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMaterials((arr) => [
                      ...arr,
                      {
                        materialId: nonFilaments[0]?.id ?? '',
                        quantity: '1',
                        groupId: groups[0]?.id ?? DEFAULT_GROUP_ID,
                      },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" /> Insumo
                </Button>
              </div>
              {materials.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin insumos extra.</p>
              )}
              {materials.map((m, idx) => (
                <div key={idx} className="mb-2 grid gap-2 rounded border p-2 sm:grid-cols-12">
                  <div className={hasMultipleGroups ? 'sm:col-span-5' : 'sm:col-span-7'}>
                    <Label className="text-xs" required>
                      Insumo
                    </Label>
                    <select
                      value={m.materialId}
                      onChange={(e) => setMaterial(idx, { materialId: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    >
                      {nonFilaments.map((mt) => (
                        <option key={mt.id} value={mt.id}>
                          {mt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={hasMultipleGroups ? 'sm:col-span-2' : 'sm:col-span-3'}>
                    <Label className="text-xs" required>
                      Cantidad
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      value={m.quantity}
                      onChange={(e) => setMaterial(idx, { quantity: e.target.value })}
                    />
                  </div>
                  {hasMultipleGroups && (
                    <div className="sm:col-span-3">
                      <Label className="text-xs">Grupo</Label>
                      <select
                        value={m.groupId}
                        onChange={(e) => setMaterial(idx, { groupId: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-end sm:col-span-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMaterials((arr) => arr.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* En multi-grupo los tiempos de armado/gestión viven en cada
                grupo (arriba). Acá solo queda el cargo de diseño, que es
                global al proyecto (un solo modelo, se cobra una vez). */}
            <div className={hasMultipleGroups ? '' : 'grid gap-3 sm:grid-cols-3'}>
              {!hasMultipleGroups && (
                <>
                  <Field label={`Tiempo de armado (min)${batchSuffix}`}>
                    <Input
                      type="number"
                      value={assemblyMinutes}
                      onChange={(e) => setAssemblyMinutes(e.target.value)}
                    />
                  </Field>
                  <Field label={`Tiempo de gestión (min)${batchSuffix}`}>
                    <Input
                      type="number"
                      value={managementMinutes}
                      onChange={(e) => setManagementMinutes(e.target.value)}
                    />
                  </Field>
                </>
              )}
              <Field label="Tiempo de diseño (min)">
                <Input
                  type="number"
                  value={designMinutes}
                  onChange={(e) => setDesignMinutes(e.target.value)}
                />
              </Field>
            </div>
            {Number(designMinutes || '0') > 0 && (
              <p className="text-xs text-muted-foreground">
                El cargo de diseño se suma una sola vez a la línea (no escala con la
                cantidad). Tarifa configurable en Parámetros → "Hora de diseño 3D".
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={calc}>
            Calcular precio
          </Button>
          <Button onClick={submit} disabled={!isFormValid || saving}>
            {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {saving ? 'Guardando…' : 'Crear cotización'}
          </Button>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <Card>
        <CardHeader>
          <CardTitle>Precio</CardTitle>
          <CardDescription>
            {withoutInvoice ? 'Aplicado al canal Efectivo.' : 'Aplicado a Venta Directa.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {preview === null && (
            <p className="text-muted-foreground">Click en "Calcular precio" para previsualizar.</p>
          )}
          {preview === 'loading' && <p className="text-muted-foreground">Calculando…</p>}
          {preview === 'error' && <p className="text-destructive">No se pudo calcular.</p>}
          {preview && typeof preview === 'object' && (
            <>
              <Row label="Costo unitario" value={formatMoney(preview.unitCost)} />
              {usesBatchInputs && (
                <p className="rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                  Calculado dividiendo por {batchSize} los valores que cargaste
                  (batch de {batchSize} llaveros · costo total de batch ≈{' '}
                  {formatMoney(preview.unitCost * batchSize)}).
                </p>
              )}
              <Row label="Precio unitario" value={formatMoney(preview.unitPrice)} />
              <div className="flex justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                <span className="text-emerald-700 dark:text-emerald-300">Ganancia / unidad</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatMoney(preview.unitProfit)}
                </span>
              </div>
              <Row label="Cantidad" value={quantity} />
              {preview.designSurcharge > 0 && (
                <Row
                  label="Cargo único de diseño"
                  value={formatMoney(preview.designSurcharge)}
                />
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatMoney(preview.lineTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descuento</span>
                <span className="font-mono">- {formatMoney(Number(discount || '0'))}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">Total</span>
                <span className="font-mono font-semibold">{formatMoney(total)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isKeychain && matrix != null && (
        <Card>
          <CardHeader>
            <CardTitle>Precios por escala</CardTitle>
            <CardDescription>
              Precio unitario y precio por placa ({batchSize} llaveros).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {matrix === 'loading' && (
              <p className="text-sm text-muted-foreground">Calculando…</p>
            )}
            {matrix === 'error' && (
              <p className="text-sm text-destructive">No se pudo cargar la matriz.</p>
            )}
            {Array.isArray(matrix) && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Escala</th>
                    <th className="py-1.5 pr-2 font-medium text-right">Precio unitario</th>
                    <th className="py-1.5 pr-0 font-medium text-right">
                      Placa × {batchSize}u
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {matrix.map((row) => {
                    const isActive = activeKeychainTier?.id === row.tierId;
                    // El primer tier vende por unidad (qty < batchSize), no
                    // por placas. Para los demás mostramos el precio de una
                    // placa completa de N unidades al markup de esa escala.
                    const placaPrice =
                      row.minQty < batchSize ? null : row.unitPrice * batchSize;
                    return (
                      <tr
                        key={row.tierId}
                        className={isActive ? 'bg-primary/10 font-medium' : ''}
                      >
                        <td className="py-1.5 pr-2 font-mono">{row.tierLabel}</td>
                        <td className="py-1.5 pr-2 text-right font-mono">
                          {formatMoney(row.unitPrice)}
                        </td>
                        <td className="py-1.5 pr-0 text-right font-mono font-semibold">
                          {placaPrice == null ? '—' : formatMoney(placaPrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

/**
 * Selector de cantidad para cotización de llaveros. Muestra:
 *   - todas las cantidades válidas de las tiers acotadas (1-4, 5-95 en
 *     pasos de 5)
 *   - cada múltiplo de 5 desde el `minQty` del tier abierto hasta 200
 *     (suficiente para cotizaciones comunes)
 *   - una opción "Otra cantidad" que abre un input numérico libre con
 *     `step=5` para pedidos más grandes
 *
 * La cantidad final se devuelve como string vía `onChange` para que
 * encaje con el state existente del form.
 */
function KeychainQtySelect({
  value,
  onChange,
  tiers,
}: {
  value: string;
  onChange: (v: string) => void;
  tiers: KeychainTierLite[];
}) {
  const openTier = tiers.find((t) => t.maxQty == null);
  const openStart = openTier?.minQty ?? 100;

  // Lista predefinida: 1..4, luego múltiplos de 5 desde 5 hasta openStart-5,
  // luego múltiplos de 5 desde openStart hasta 200 (cota razonable para el
  // dropdown; valores mayores se cargan vía "Otra cantidad").
  const presets: number[] = [];
  for (let n = 1; n <= 4; n++) presets.push(n);
  for (let n = 5; n < openStart; n += 5) presets.push(n);
  for (let n = openStart; n <= 200; n += 5) presets.push(n);

  const numValue = Number(value);
  const isCustom = !presets.includes(numValue) && numValue > 0;
  const [customMode, setCustomMode] = useState(isCustom);
  const [customQty, setCustomQty] = useState(isCustom ? value : '');

  const onSelectChange = (raw: string) => {
    if (raw === '__custom__') {
      setCustomMode(true);
      // No tocamos `value` todavía; se actualiza cuando el usuario tipea.
      return;
    }
    setCustomMode(false);
    onChange(raw);
  };

  return (
    <div className="space-y-1.5">
      <select
        value={customMode ? '__custom__' : value}
        onChange={(e) => onSelectChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
      >
        {presets.map((n) => (
          <option key={n} value={String(n)}>
            {n}
          </option>
        ))}
        <option value="__custom__">Otra cantidad (múltiplo de 5)…</option>
      </select>
      {customMode && (
        <Input
          type="number"
          min={openStart}
          step={5}
          placeholder={`≥ ${openStart}, múltiplo de 5`}
          value={customQty}
          onChange={(e) => {
            setCustomQty(e.target.value);
            onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
