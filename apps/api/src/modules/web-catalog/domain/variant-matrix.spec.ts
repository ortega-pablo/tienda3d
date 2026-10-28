import { selectionKey, variantMatrix } from './variant-matrix';

describe('variantMatrix', () => {
  const cuaderno = { id: 'm-cuaderno', productId: 'p-cuaderno' };

  it('un cuaderno con "Tipo de hoja: Cuadro/Punto" da una variante por valor, del mismo miembro (mismo precio)', () => {
    const combos = variantMatrix({
      members: [cuaderno],
      colorOptions: [],
      attributes: [{ id: 'hoja', values: ['cuadro', 'punto'] }],
    });

    expect(combos).toHaveLength(2);
    expect(combos.map((c) => c.memberId)).toEqual(['m-cuaderno', 'm-cuaderno']);
    expect(combos.map((c) => c.selections)).toEqual([
      [{ kind: 'attribute', attributeId: 'hoja', valueId: 'cuadro' }],
      [{ kind: 'attribute', attributeId: 'hoja', valueId: 'punto' }],
    ]);
  });

  it('la Trapecio (2 tamaños × 4 colores) da 8 combinaciones', () => {
    const combos = variantMatrix({
      members: [
        { id: 'm280', productId: 'p280' },
        { id: 'm390', productId: 'p390' },
      ],
      colorOptions: [
        { id: 'color', values: ['negro', 'blanco', 'rojo', 'azul'], productIds: ['p280', 'p390'] },
      ],
      attributes: [],
    });

    expect(combos).toHaveLength(8);
    expect(new Set(combos.map((c) => c.selectionKey)).size).toBe(8);
  });

  it('una opción de color solo multiplica a los miembros cuyas piezas pinta', () => {
    const combos = variantMatrix({
      members: [
        { id: 'm280', productId: 'p280' },
        { id: 'm390', productId: 'p390' },
      ],
      colorOptions: [
        { id: 'pantalla', values: ['blanco', 'rojo'], productIds: ['p280', 'p390'] },
        { id: 'base', values: ['negro', 'gris', 'madera'], productIds: ['p390'] },
      ],
      attributes: [],
    });

    expect(combos.filter((c) => c.memberId === 'm280')).toHaveLength(2);
    expect(combos.filter((c) => c.memberId === 'm390')).toHaveLength(6);
  });

  it('sin opciones, una combinación por miembro; con una opción sin valores, ninguna', () => {
    expect(
      variantMatrix({ members: [cuaderno], colorOptions: [], attributes: [] }).map(
        (c) => c.selectionKey,
      ),
    ).toEqual(['m=m-cuaderno']);
    expect(
      variantMatrix({
        members: [cuaderno],
        colorOptions: [],
        attributes: [{ id: 'a', values: [] }],
      }),
    ).toEqual([]);
  });

  it('la clave no depende del orden de las opciones', () => {
    const color = { kind: 'color', optionId: 'c1', materialId: 'negro' } as const;
    const hoja = { kind: 'attribute', attributeId: 'a1', valueId: 'punto' } as const;
    expect(selectionKey('m', [color, hoja])).toBe(selectionKey('m', [hoja, color]));
    expect(selectionKey('m', [color, hoja])).toBe('m=m;a:a1=punto;c:c1=negro');
  });
});
