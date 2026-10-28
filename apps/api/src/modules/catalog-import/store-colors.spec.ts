import { colorKey, planStoreColors, STORE_COLORS } from './store-colors';

describe('Colores de la web en el sistema (F9·1)', () => {
  it('son los 11 de §4.8, sin repetidos', () => {
    expect(STORE_COLORS).toHaveLength(11);
    expect(new Set(STORE_COLORS.map((c) => colorKey(c.color))).size).toBe(11);
  });

  it('el nombre se compara sin tildes, mayúsculas ni espacios de más', () => {
    expect(colorKey('  Gris  Carbon ')).toBe(colorKey('Gris carbón'));
    expect(colorKey('MARRÓN')).toBe('marron');
  });

  it('en una línea vacía crea todos', () => {
    const plan = planStoreColors([]);
    expect(plan.map((s) => s.kind)).toEqual(Array(11).fill('create'));
  });

  it('respeta lo que ya cargó la dueña', () => {
    const plan = planStoreColors(
      [
        { id: 'b', color: 'Blanco', colorHex: '#FFFFFF', isActive: true },
        { id: 'n', color: 'negro', colorHex: null, isActive: true },
        { id: 'p', color: 'Perla', colorHex: '#eeeeee', isActive: true },
        { id: 'm', color: 'Marron', colorHex: '#a16958', isActive: false },
      ],
      STORE_COLORS.slice(0, 5),
    );
    expect(plan).toEqual([
      { kind: 'ok', id: 'b', color: 'Blanco' },
      { kind: 'set-hex', id: 'n', color: 'negro', colorHex: '#000000' },
      { kind: 'other-hex', id: 'p', color: 'Perla', systemHex: '#eeeeee', webHex: '#f0ede8' },
      { kind: 'inactive', id: 'm', color: 'Marron' },
      { kind: 'create', color: 'Vainilla', colorHex: '#c9b8a4' },
    ]);
  });

  it('si el color está repetido, cuenta el activo', () => {
    const plan = planStoreColors(
      [
        { id: 'viejo', color: 'Beige', colorHex: '#f9bd72', isActive: false },
        { id: 'nuevo', color: 'Beige', colorHex: '#f9bd72', isActive: true },
      ],
      [{ color: 'Beige', colorHex: '#f9bd72' }],
    );
    expect(plan).toEqual([{ kind: 'ok', id: 'nuevo', color: 'Beige' }]);
  });
});
