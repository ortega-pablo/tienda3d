/**
 * Matriz de combinaciones vendibles de una publicación (plan F5·4/F5·5):
 * miembro × colores de cada opción de color que lo pinta × valores de cada
 * opción informativa. Reglas puras, sin base.
 *
 * El precio sale del producto del sistema del miembro (T5), así que todas las
 * combinaciones de un mismo miembro tienen el mismo precio: los colores y las
 * opciones informativas no lo cambian (D6).
 */

export interface MatrixMember {
  id: string;
  productId: string;
}

export interface MatrixColorOption {
  id: string;
  /** Colores (ids de material) en el orden en que se muestran. */
  values: string[];
  /** Productos del sistema cuyas piezas pinta la opción. */
  productIds: string[];
}

export interface MatrixAttribute {
  id: string;
  /** Ids de los valores en el orden en que se muestran. */
  values: string[];
}

export interface MatrixInput {
  members: MatrixMember[];
  colorOptions: MatrixColorOption[];
  attributes: MatrixAttribute[];
}

export type MatrixSelection =
  | { kind: 'color'; optionId: string; materialId: string }
  | { kind: 'attribute'; attributeId: string; valueId: string };

export interface MatrixCombination {
  memberId: string;
  selections: MatrixSelection[];
  /** Clave canónica de la combinación, única dentro de la publicación. */
  selectionKey: string;
}

export function variantMatrix(input: MatrixInput): MatrixCombination[] {
  return input.members.flatMap((member) => {
    const axes: MatrixSelection[][] = [
      ...input.colorOptions
        .filter((o) => o.productIds.includes(member.productId))
        .map((o) =>
          o.values.map(
            (materialId): MatrixSelection => ({ kind: 'color', optionId: o.id, materialId }),
          ),
        ),
      ...input.attributes.map((a) =>
        a.values.map(
          (valueId): MatrixSelection => ({ kind: 'attribute', attributeId: a.id, valueId }),
        ),
      ),
    ];
    return cartesian(axes).map((selections) => ({
      memberId: member.id,
      selections,
      selectionKey: selectionKey(member.id, selections),
    }));
  });
}

/** `m=<miembro>;a:<atributo>=<valor>;c:<opción>=<color>`, con los ejes ordenados. */
export function selectionKey(memberId: string, selections: MatrixSelection[]): string {
  const parts = selections
    .map((s) =>
      s.kind === 'color' ? `c:${s.optionId}=${s.materialId}` : `a:${s.attributeId}=${s.valueId}`,
    )
    .sort();
  return [`m=${memberId}`, ...parts].join(';');
}

function cartesian<T>(axes: T[][]): T[][] {
  return axes.reduce<T[][]>(
    (acc, values) => acc.flatMap((combo) => values.map((value) => [...combo, value])),
    [[]],
  );
}
