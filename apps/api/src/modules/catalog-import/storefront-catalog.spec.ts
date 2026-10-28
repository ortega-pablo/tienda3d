import {
  availabilityOf,
  planPublication,
  type PlanContext,
  type StorefrontProduct,
  type StorefrontVariant,
} from './storefront-catalog';

const variant = (
  options: Record<string, string>,
  rest: Partial<StorefrontVariant> = {},
): StorefrontVariant => ({
  legacyWooId: null,
  sku: 'PTK-PROD-000005',
  priceCents: 1,
  compareAtPriceCents: null,
  trackStock: true,
  stockQuantity: 1,
  allowBackorder: false,
  maxPerOrder: null,
  imageFile: null,
  options,
  ...rest,
});

const lina: StorefrontProduct = {
  legacyWooId: 304,
  slug: 'lampara-lina-mesa-3d',
  name: 'Lámpara Lina — Mesa',
  summary: '',
  description: '',
  sortOrder: 0,
  categorySlugs: ['lampara'],
  weightGrams: null,
  dimensionsMm: null,
  images: [
    { file: 'a.webp', alt: '', width: 1, height: 1 },
    { file: 'b.webp', alt: '', width: 1, height: 1 },
  ],
  options: [
    {
      slug: 'color',
      name: 'Color',
      values: [
        { slug: 'negro', label: 'Negro', colorHex: '#000000' },
        { slug: 'gris-carbon', label: 'Gris carbón', colorHex: '#424447' },
      ],
    },
  ],
  variants: [
    variant({ color: 'negro' }, { imageFile: 'a.webp' }),
    variant({ color: 'gris-carbon' }, { imageFile: 'a.webp' }),
  ],
};

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  products: new Map([
    [
      'PTK-PROD-000005',
      { id: 'p5', name: 'Lina', isActive: true, directSale: true, publication: null },
    ],
  ]),
  colors: new Map([
    ['negro', { id: 'm-negro', color: 'Negro' }],
    ['gris carbon', { id: 'm-gris', color: 'Gris Carbon' }],
  ]),
  files: new Set(['a.webp', 'b.webp']),
  ...over,
});
const mapping = { members: [{ sku: 'PTK-PROD-000005' }] };
const categories = [{ slug: 'lampara' }];

describe('Importación del catálogo de la web: el plan (F9·2)', () => {
  it('la disponibilidad de la web pasa a D9', () => {
    expect(availabilityOf(variant({}, { trackStock: false, stockQuantity: 4 }))).toEqual({
      availability: 'MADE_TO_ORDER',
      stockQuantity: 0,
    });
    expect(availabilityOf(variant({}, { stockQuantity: 3 }))).toEqual({
      availability: 'STOCK_ONLY',
      stockQuantity: 3,
    });
    expect(availabilityOf(variant({}, { allowBackorder: true, stockQuantity: -2 }))).toEqual({
      availability: 'STOCK_THEN_ORDER',
      stockQuantity: 0,
    });
  });

  it('arma la publicación con los colores del sistema', () => {
    const result = planPublication(lina, mapping, categories, ctx());
    if (!result.ok) throw new Error(result.errors.join('; '));
    expect(result.plan).toMatchObject({
      optionLabel: null,
      members: [{ productId: 'p5', sku: 'PTK-PROD-000005', valueLabel: '' }],
      colorOption: { label: 'Color', colorIds: ['m-negro', 'm-gris'] },
      attributes: [],
      skippedVariants: 0,
    });
    expect(result.plan.variants).toHaveLength(2);
    // La foto "a" la usan dos colores: no es de ninguno.
    expect(result.plan.images.map((i) => i.colorId)).toEqual([null, null]);
  });

  it('una foto que usa un solo color es de ese color', () => {
    const result = planPublication(
      {
        ...lina,
        variants: [
          variant({ color: 'negro' }, { imageFile: 'a.webp' }),
          variant({ color: 'gris-carbon' }, { imageFile: 'b.webp' }),
        ],
      },
      mapping,
      categories,
      ctx(),
    );
    expect(result.ok && result.plan.images.map((i) => i.colorId)).toEqual(['m-negro', 'm-gris']);
  });

  it('sin producto del sistema no hay variantes, pero sí contenido', () => {
    const result = planPublication(lina, { members: [] }, categories, ctx());
    expect(result.ok && result.plan).toMatchObject({
      members: [],
      variants: [],
      skippedVariants: 2,
    });
  });

  it('informa todo lo que impide importar', () => {
    const result = planPublication(
      { ...lina, categorySlugs: ['lampara', 'velas'] },
      { members: [{ sku: 'PTK-PROD-000005' }, { sku: 'PTK-PROD-000099' }] },
      categories,
      ctx({
        products: new Map([
          [
            'PTK-PROD-000005',
            { id: 'p5', name: 'Lina', isActive: false, directSale: false, publication: 'otra' },
          ],
        ]),
        colors: new Map([['negro', { id: 'm-negro', color: 'Negro' }]]),
        files: new Set(['a.webp']),
      }),
    );
    expect(result.ok ? [] : result.errors).toEqual([
      'con más de un miembro hace falta memberOption',
      'PTK-PROD-000005 "Lina" está archivado',
      'PTK-PROD-000005 "Lina" no tiene Venta Directa habilitada',
      'PTK-PROD-000005 "Lina" ya está en la publicación otra',
      'PTK-PROD-000099 no existe en el sistema',
      'el color Gris carbón no está en la línea de filamento (store-colors.ts)',
      'categoría velas inexistente',
      'falta la foto b.webp',
    ]);
  });

  it('con varios miembros, cada valor de la opción tiene su producto', () => {
    const result = planPublication(
      {
        ...lina,
        options: [
          ...lina.options,
          {
            slug: 'tamano',
            name: 'Tamaño',
            values: [
              { slug: '280', label: '280', colorHex: null },
              { slug: '380', label: '380', colorHex: null },
            ],
          },
        ],
      },
      { memberOption: 'tamano', members: [{ sku: 'PTK-PROD-000005', value: '280' }] },
      categories,
      ctx(),
    );
    expect(result.ok ? [] : result.errors).toEqual(['Tamaño "380" no tiene producto']);
  });

  it('sin entrada en la tabla no se importa', () => {
    expect(planPublication(lina, undefined, categories, ctx())).toEqual({
      ok: false,
      errors: ['no está en la tabla de correspondencia (catalog-mapping.ts)'],
    });
  });
});
