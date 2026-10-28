import { DEFAULT_MAX_PER_ORDER, variantAvailability } from './availability';

describe('variantAvailability (D9)', () => {
  const base = { isActive: true, stockQuantity: 0, maxPerOrder: null };

  it('una variante inactiva no se vende', () => {
    expect(
      variantAvailability({ ...base, availability: 'MADE_TO_ORDER', isActive: false }),
    ).toEqual({ state: 'OUT_OF_STOCK', maxQuantity: 0 });
  });

  it('a pedido se vende siempre, hasta el máximo por pedido', () => {
    expect(variantAvailability({ ...base, availability: 'MADE_TO_ORDER' })).toEqual({
      state: 'MADE_TO_ORDER',
      maxQuantity: DEFAULT_MAX_PER_ORDER,
    });
    expect(
      variantAvailability({ ...base, availability: 'MADE_TO_ORDER', maxPerOrder: 3 }).maxQuantity,
    ).toBe(3);
  });

  it('solo stock: hasta lo que hay, y sin stock no se vende', () => {
    expect(variantAvailability({ ...base, availability: 'STOCK_ONLY', stockQuantity: 2 })).toEqual({
      state: 'IN_STOCK',
      maxQuantity: 2,
    });
    expect(
      variantAvailability({
        ...base,
        availability: 'STOCK_ONLY',
        stockQuantity: 50,
        maxPerOrder: 5,
      }).maxQuantity,
    ).toBe(5);
    expect(variantAvailability({ ...base, availability: 'STOCK_ONLY' })).toEqual({
      state: 'OUT_OF_STOCK',
      maxQuantity: 0,
    });
  });

  it('stock y después a pedido: con stock sale ya; sin stock, se fabrica', () => {
    expect(
      variantAvailability({ ...base, availability: 'STOCK_THEN_ORDER', stockQuantity: 1 }),
    ).toEqual({ state: 'IN_STOCK', maxQuantity: DEFAULT_MAX_PER_ORDER });
    expect(variantAvailability({ ...base, availability: 'STOCK_THEN_ORDER' })).toEqual({
      state: 'MADE_TO_ORDER',
      maxQuantity: DEFAULT_MAX_PER_ORDER,
    });
  });
});
