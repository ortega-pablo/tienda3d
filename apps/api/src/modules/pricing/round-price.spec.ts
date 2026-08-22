import { roundPriceUp } from './round-price';

describe('roundPriceUp', () => {
  it('redondea hacia arriba al siguiente múltiplo del paso', () => {
    expect(roundPriceUp(1_234_567, 50)).toBe(1_234_600);
    expect(roundPriceUp(1234.5, 50)).toBe(1250);
    expect(roundPriceUp(1, 50)).toBe(50);
  });

  it('un valor ya múltiplo queda igual (ceil idempotente)', () => {
    expect(roundPriceUp(1_234_600, 50)).toBe(1_234_600);
    expect(roundPriceUp(100, 100)).toBe(100);
  });

  it('step ≤ 0 desactiva el redondeo (valor exacto)', () => {
    expect(roundPriceUp(1_234_567, 0)).toBe(1_234_567);
    expect(roundPriceUp(1_234_567, -5)).toBe(1_234_567);
  });

  it('valor ≤ 0 no se toca', () => {
    expect(roundPriceUp(0, 50)).toBe(0);
    expect(roundPriceUp(-30, 50)).toBe(-30);
  });

  it('funciona con otros pasos', () => {
    expect(roundPriceUp(1_234_567, 100)).toBe(1_234_600);
    expect(roundPriceUp(1_234_567, 10)).toBe(1_234_570);
    expect(roundPriceUp(1_234_567, 1)).toBe(1_234_567);
  });

  it('valores no finitos no rompen', () => {
    expect(roundPriceUp(1000, Number.NaN)).toBe(1000);
    expect(roundPriceUp(Number.NaN, 50)).toBeNaN();
  });
});

describe('roundPriceUp — error de punto flotante', () => {
  it('no cobra un paso de más cuando el valor ya era múltiplo', () => {
    // Ambos salen de multiplicaciones/divisiones reales del motor.
    expect(roundPriceUp(3000.0000000000005, 100)).toBe(3000);
    expect(roundPriceUp(1210.0000000000002, 10)).toBe(1210);
  });

  it('un excedente real sí sube al siguiente múltiplo', () => {
    expect(roundPriceUp(3000.01, 100)).toBe(3100);
    expect(roundPriceUp(1211, 10)).toBe(1220);
  });

  it('sigue siendo idempotente', () => {
    for (const [value, step] of [[3000.0000000000005, 100], [1234.56, 50], [7, 5]] as const) {
      const once = roundPriceUp(value, step);
      expect(roundPriceUp(once, step)).toBe(once);
    }
  });
});
