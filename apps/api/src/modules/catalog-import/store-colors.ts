/**
 * Los colores que vende hoy la web (plan §4.8, F9·1). La tienda solo ofrece
 * colores que existen en el sistema (D12), así que se cargan como variantes de
 * una línea de filamento. Lógica pura: la aplica `scripts/store-colors.ts`.
 *
 * Sin alias `@/`: el script corre con tsx dentro de la imagen, sin tsconfig.
 */

export interface StoreColor {
  color: string;
  colorHex: string;
}

export const STORE_COLORS: readonly StoreColor[] = [
  { color: 'Blanco', colorHex: '#ffffff' },
  { color: 'Negro', colorHex: '#000000' },
  { color: 'Perla', colorHex: '#f0ede8' },
  { color: 'Marrón', colorHex: '#a16958' },
  { color: 'Vainilla', colorHex: '#c9b8a4' },
  { color: 'Beige', colorHex: '#f9bd72' },
  { color: 'Verde Militar', colorHex: '#8a8e63' },
  { color: 'Verde Manzana', colorHex: '#92b275' },
  { color: 'Verde Oliva', colorHex: '#baaa5b' },
  { color: 'Gris carbón', colorHex: '#424447' },
  { color: 'Frutilla', colorHex: '#f0529c' },
];

/** Un color ya cargado en la línea. */
export interface LineColor {
  id: string;
  color: string | null;
  colorHex: string | null;
  isActive: boolean;
}

export type ColorStep =
  | { kind: 'create'; color: string; colorHex: string }
  | { kind: 'set-hex'; id: string; color: string; colorHex: string }
  | { kind: 'ok'; id: string; color: string }
  /** El sistema ya tiene otro código: manda el del sistema. */
  | { kind: 'other-hex'; id: string; color: string; systemHex: string; webHex: string }
  /** Dado de baja: reactivarlo lo decide la dueña, no el script. */
  | { kind: 'inactive'; id: string; color: string };

/** "Gris Carbon", "gris  carbón" y "Gris carbón" son el mismo color. */
export function colorKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Qué hacer con cada color de la web. Nunca pisa lo que cargó la dueña: crea
 * lo que falta y completa el código de color vacío; el resto lo informa.
 */
export function planStoreColors(
  existing: readonly LineColor[],
  wanted: readonly StoreColor[] = STORE_COLORS,
): ColorStep[] {
  const byKey = new Map<string, LineColor & { color: string }>();
  for (const c of existing) {
    if (!c.color) continue;
    const key = colorKey(c.color);
    const prev = byKey.get(key);
    // Si está repetido, cuenta el activo.
    if (!prev || (!prev.isActive && c.isActive)) byKey.set(key, { ...c, color: c.color });
  }

  return wanted.map((w): ColorStep => {
    const found = byKey.get(colorKey(w.color));
    if (!found) return { kind: 'create', color: w.color, colorHex: w.colorHex };
    if (!found.isActive) return { kind: 'inactive', id: found.id, color: found.color };
    if (!found.colorHex) {
      return { kind: 'set-hex', id: found.id, color: found.color, colorHex: w.colorHex };
    }
    if (found.colorHex.toLowerCase() !== w.colorHex.toLowerCase()) {
      return {
        kind: 'other-hex',
        id: found.id,
        color: found.color,
        systemHex: found.colorHex,
        webHex: w.colorHex,
      };
    }
    return { kind: 'ok', id: found.id, color: found.color };
  });
}
