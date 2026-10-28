/**
 * Formato de texto simple de las descripciones de la tienda. Copia de
 * `storefront/src/domain/rich-text.ts` (otro repo): la vista previa del panel
 * tiene que dibujar exactamente lo que va a mostrar el sitio.
 *
 *   Párrafos separados por una línea en blanco.
 *   Un salto de línea simple se respeta.
 *   **negrita** y *itálica*.
 *   Listas: líneas que empiezan con "- ".
 */

export type Inline = { kind: 'text' | 'strong' | 'em'; text: string };
export type Block = { kind: 'paragraph'; lines: Inline[][] } | { kind: 'list'; items: Inline[][] };

const INLINE_PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*/g;

export function parseInline(line: string): Inline[] {
  const result: Inline[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE_PATTERN)) {
    if (match.index > last) result.push({ kind: 'text', text: line.slice(last, match.index) });
    if (match[1] !== undefined) result.push({ kind: 'strong', text: match[1] });
    else result.push({ kind: 'em', text: match[2]! });
    last = match.index + match[0].length;
  }
  if (last < line.length) result.push({ kind: 'text', text: line.slice(last) });
  return result;
}

export function parseRichText(input: string): Block[] {
  return input
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0)
    .map(
      (lines): Block =>
        lines.every((l) => l.startsWith('- '))
          ? { kind: 'list', items: lines.map((l) => parseInline(l.slice(2))) }
          : { kind: 'paragraph', lines: lines.map(parseInline) },
    );
}
