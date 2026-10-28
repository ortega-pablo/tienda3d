import { variantMatrix } from './variant-matrix';
import { nextVariantSkus, planVariants, type ExistingVariant } from './variant-plan';

describe('planVariants', () => {
  const trapecio = (colores: string[]) =>
    variantMatrix({
      members: [
        { id: 'm280', productId: 'p280' },
        { id: 'm390', productId: 'p390' },
      ],
      colorOptions: [{ id: 'color', values: colores, productIds: ['p280', 'p390'] }],
      attributes: [],
    });
  const existentes = (colores: string[], extra: Partial<ExistingVariant> = {}) =>
    trapecio(colores).map((c) => ({
      id: c.selectionKey,
      selectionKey: c.selectionKey,
      isActive: true,
      pausedByAdmin: false,
      ...extra,
    }));

  it('sin variantes, crea toda la matriz', () => {
    const plan = planVariants(trapecio(['negro', 'blanco', 'rojo', 'azul']), []);
    expect(plan.create).toHaveLength(8);
    expect(plan.keep).toEqual([]);
  });

  it('quitar un color desactiva sus 2 variantes y conserva las otras 6', () => {
    const plan = planVariants(
      trapecio(['negro', 'blanco', 'rojo']),
      existentes(['negro', 'blanco', 'rojo', 'azul']),
    );
    expect(plan.create).toEqual([]);
    expect(plan.keep).toHaveLength(6);
    expect(plan.deactivate).toHaveLength(2);
    expect(plan.deactivate.every((id) => id.includes('=azul'))).toBe(true);
  });

  it('re-agregar un color reactiva sus variantes, salvo las pausadas a mano', () => {
    const viejas = existentes(['azul'], { isActive: false });
    viejas[0]!.pausedByAdmin = true;
    const plan = planVariants(trapecio(['negro', 'azul']), [...existentes(['negro']), ...viejas]);

    expect(plan.keep).toHaveLength(2);
    expect(plan.reactivate).toEqual([viejas[1]!.id]);
    expect(plan.paused).toEqual([viejas[0]!.id]);
    expect(plan.create).toEqual([]);
  });

  it('no vuelve a desactivar las que ya están inactivas', () => {
    const plan = planVariants(trapecio(['negro']), existentes(['azul'], { isActive: false }));
    expect(plan.deactivate).toEqual([]);
    expect(plan.create).toHaveLength(2);
  });
});

describe('nextVariantSkus', () => {
  it('sigue el contador del producto y no reutiliza números', () => {
    expect(nextVariantSkus('PTK-PROD-000012', [], 2)).toEqual([
      'PTK-PROD-000012-V01',
      'PTK-PROD-000012-V02',
    ]);
    expect(
      nextVariantSkus(
        'PTK-PROD-000012',
        ['PTK-PROD-000012-V01', 'PTK-PROD-000012-V07', 'PTK-PROD-000120-V09'],
        1,
      ),
    ).toEqual(['PTK-PROD-000012-V08']);
  });

  it('pasa de V99 a V100', () => {
    expect(nextVariantSkus('P', ['P-V99'], 1)).toEqual(['P-V100']);
  });
});
