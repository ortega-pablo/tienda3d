import type {
  ItemDraft,
  ProductQuoteInitialState,
} from './nueva-catalogo/product-quote-form';
import type {
  GroupDraft,
  MaterialDraft,
  PieceDraft,
  RapidQuoteInitialState,
} from './nueva-a-medida/rapid-quote-form';

/**
 * Helpers para "usar una cotización como base" (re-cotizar). Reconstruyen los
 * INPUTS de una cotización existente en el estado inicial de los forms de alta.
 * Los precios NO se copian: se recalculan al previsualizar/guardar.
 *
 * Módulo puro (sin 'use client') para poder usarse desde los server components
 * de las páginas de alta.
 */

interface AdhocPieceFull {
  name?: string;
  grams?: number;
  printMinutes?: number;
  filamentId?: string;
}

interface AdhocPayloadFull {
  pieces?: AdhocPieceFull[];
  individualPieces?: AdhocPieceFull[];
  materials?: Array<{ materialId?: string; quantity?: number }>;
  assemblyMinutes?: number;
  managementMinutes?: number;
  designMinutes?: number;
  templateKind?: 'KEYCHAIN';
}

export interface QuoteForPrefill {
  type: 'PRODUCT' | 'ADHOC';
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  withInvoice: boolean;
  validUntil: string | null;
  discount: number;
  notes: string | null;
  items: Array<{
    productId: string | null;
    description: string;
    quantity: number;
    adhocPayload: AdhocPayloadFull | null;
  }>;
}

const numToStr = (n: number | undefined | null): string => (n == null ? '' : String(n));

export function isKeychainQuote(quote: QuoteForPrefill): boolean {
  return (
    quote.type === 'ADHOC' &&
    quote.items.some((i) => i.adhocPayload?.templateKind === 'KEYCHAIN')
  );
}

// ----- PRODUCT -----

export function buildProductInitialState(quote: QuoteForPrefill): ProductQuoteInitialState {
  const items: ItemDraft[] = quote.items.map((i) => ({
    productId: i.productId ?? '',
    quantity: String(i.quantity),
    // `description` es el override opcional del form; lo dejamos vacío para no
    // forzar un override con el nombre del producto.
    description: '',
  }));
  return {
    customerId: quote.customerId ?? '',
    customerName: quote.customerName ?? '',
    customerEmail: quote.customerEmail ?? '',
    customerPhone: quote.customerPhone ?? '',
    customerNotes: quote.customerNotes ?? '',
    withoutInvoice: !quote.withInvoice,
    discount: String(quote.discount ?? 0),
    notes: quote.notes ?? '',
    items: items.length > 0 ? items : [{ productId: '', quantity: '1', description: '' }],
  };
}

/** Ids de producto referenciados por la cotización (para avisos/augment). */
export function referencedProductIds(quote: QuoteForPrefill): string[] {
  return [...new Set(quote.items.map((i) => i.productId).filter((id): id is string => !!id))];
}

// ----- ADHOC (a medida libre y llavero) -----

export function buildRapidInitialState(
  quote: QuoteForPrefill,
  isKeychain: boolean,
): RapidQuoteInitialState {
  const groups: GroupDraft[] = [];
  const pieces: PieceDraft[] = [];
  const materials: MaterialDraft[] = [];
  let designTotal = 0;

  quote.items.forEach((item, idx) => {
    // El primer grupo DEBE ser 'g1' (DEFAULT_GROUP_ID) para que los alias del
    // form (cantidad/armado/gestión single-group) apunten al grupo correcto.
    const gid = idx === 0 ? 'g1' : `g${idx + 1}_prefill`;
    const p = item.adhocPayload ?? {};
    groups.push({
      id: gid,
      name: item.description || (isKeychain ? 'Llavero' : `Grupo ${idx + 1}`),
      quantity: String(item.quantity),
      assemblyMinutes: numToStr(p.assemblyMinutes ?? 0),
      managementMinutes: numToStr(p.managementMinutes ?? 0),
    });
    // En keychain, `pieces` del payload = tanda (BATCH); `individualPieces` = 1
    // unidad (INDIVIDUAL). En ADHOC libre todas van como INDIVIDUAL (el scope se
    // ignora en ese modo).
    for (const pc of p.pieces ?? []) {
      pieces.push({
        name: pc.name ?? 'Pieza',
        grams: numToStr(pc.grams),
        printMinutes: numToStr(pc.printMinutes),
        filamentId: pc.filamentId ?? '',
        groupId: gid,
        scope: isKeychain ? 'BATCH' : 'INDIVIDUAL',
      });
    }
    for (const pc of p.individualPieces ?? []) {
      pieces.push({
        name: pc.name ?? 'Pieza',
        grams: numToStr(pc.grams),
        printMinutes: numToStr(pc.printMinutes),
        filamentId: pc.filamentId ?? '',
        groupId: gid,
        scope: 'INDIVIDUAL',
      });
    }
    for (const m of p.materials ?? []) {
      materials.push({
        materialId: m.materialId ?? '',
        quantity: numToStr(m.quantity ?? 1),
        groupId: gid,
      });
    }
    designTotal += Number(p.designMinutes ?? 0);
  });

  const description =
    quote.items.length === 1
      ? quote.items[0]!.description || (isKeychain ? 'Llavero personalizado' : 'Pieza a medida')
      : isKeychain
        ? 'Llavero personalizado'
        : 'Pieza a medida';

  return {
    customerId: quote.customerId ?? '',
    customerName: quote.customerName ?? '',
    customerEmail: quote.customerEmail ?? '',
    customerPhone: quote.customerPhone ?? '',
    customerNotes: quote.customerNotes ?? '',
    withoutInvoice: !quote.withInvoice,
    discount: String(quote.discount ?? 0),
    notes: quote.notes ?? '',
    description,
    designMinutes: String(designTotal),
    groups,
    pieces,
    materials,
  };
}

/** Ids de filamento e insumo referenciados por los payloads ADHOC. */
export function referencedMaterialIds(quote: QuoteForPrefill): {
  filamentIds: string[];
  materialIds: string[];
} {
  const filamentIds = new Set<string>();
  const materialIds = new Set<string>();
  for (const item of quote.items) {
    const p = item.adhocPayload ?? {};
    for (const pc of [...(p.pieces ?? []), ...(p.individualPieces ?? [])]) {
      if (pc.filamentId) filamentIds.add(pc.filamentId);
    }
    for (const m of p.materials ?? []) {
      if (m.materialId) materialIds.add(m.materialId);
    }
  }
  return { filamentIds: [...filamentIds], materialIds: [...materialIds] };
}

export interface MaterialFull {
  id: string;
  name: string;
  type: 'FILAMENT' | 'SHEET' | 'PACKAGING' | 'HARDWARE' | 'OTHER';
  unit: string;
  isActive: boolean;
}

/**
 * Arma las listas de opciones (filamentos + insumos) de los forms ADHOC a
 * partir del catálogo completo de materiales. Incluye los activos y, si se
 * pasa `ref` (re-cotizar), también los inactivos referenciados por la
 * cotización original (marcados "(inactivo)"), para que los `<select>`
 * puedan mostrar la selección precargada. Devuelve avisos si algo ya no existe.
 */
export function buildAdhocOptionLists(
  allMaterials: MaterialFull[],
  ref: { filamentIds: string[]; materialIds: string[] } | null,
): {
  filaments: Array<{ id: string; name: string }>;
  nonFilaments: MaterialFull[];
  notice: string[];
} {
  const refFil = new Set(ref?.filamentIds ?? []);
  const refMat = new Set(ref?.materialIds ?? []);
  const notice: string[] = [];

  const filaments = allMaterials
    .filter((m) => m.type === 'FILAMENT' && (m.isActive || refFil.has(m.id)))
    .map((m) => ({ id: m.id, name: m.isActive ? m.name : `${m.name} (inactivo)` }));

  const nonFilaments = allMaterials
    .filter((m) => m.type !== 'FILAMENT' && (m.isActive || refMat.has(m.id)))
    .map((m) => (m.isActive ? m : { ...m, name: `${m.name} (inactivo)` }));

  if (ref) {
    const allIds = new Set(allMaterials.map((m) => m.id));
    const missing =
      [...refFil].filter((id) => !allIds.has(id)).length +
      [...refMat].filter((id) => !allIds.has(id)).length;
    if (missing > 0) {
      notice.push(
        'Algún filamento o insumo de la cotización original ya no existe. Revisá y corregí las selecciones marcadas antes de guardar.',
      );
    }
    const inactiveIncluded = allMaterials.some(
      (m) =>
        !m.isActive &&
        ((m.type === 'FILAMENT' && refFil.has(m.id)) ||
          (m.type !== 'FILAMENT' && refMat.has(m.id))),
    );
    if (inactiveIncluded) {
      notice.push('Algunos insumos referenciados están inactivos (marcados "(inactivo)").');
    }
  }

  return { filaments, nonFilaments, notice };
}
