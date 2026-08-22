import { addBusinessDays, addBusinessMonths, startOfBusinessMonth } from './date';

/** Día de la semana (0=dom..6=sáb) en hora de pared argentina. */
function arDow(d: Date): number {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
}

describe('addBusinessDays', () => {
  it('nunca cae en sábado ni domingo', () => {
    for (let i = 0; i < 30; i++) {
      const start = new Date(Date.UTC(2026, 6, 1 + i, 15, 0, 0));
      const dow = arDow(addBusinessDays(start, 15));
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    }
  });

  it('15 días hábiles = 3 semanas (21 días corridos) desde un día hábil', () => {
    // 2026-07-06 es lunes.
    const monday = new Date(Date.UTC(2026, 6, 6, 15, 0, 0));
    expect(arDow(monday)).toBe(1); // sanity: es lunes
    const result = addBusinessDays(monday, 15);
    const days = Math.round((result.getTime() - monday.getTime()) / 86_400_000);
    expect(days).toBe(21);
    expect(arDow(result)).toBe(1); // vuelve a caer lunes
  });

  it('+1 día hábil desde un viernes salta al lunes', () => {
    // 2026-07-10 es viernes.
    const friday = new Date(Date.UTC(2026, 6, 10, 15, 0, 0));
    expect(arDow(friday)).toBe(5);
    const result = addBusinessDays(friday, 1);
    expect(arDow(result)).toBe(1); // lunes
    const days = Math.round((result.getTime() - friday.getTime()) / 86_400_000);
    expect(days).toBe(3);
  });

  it('fija el resultado al mediodía de Argentina (15:00 UTC)', () => {
    const result = addBusinessDays(new Date(Date.UTC(2026, 0, 1, 8, 30, 0)), 5);
    expect(result.getUTCHours()).toBe(15);
    expect(result.getUTCMinutes()).toBe(0);
  });
});

describe('startOfBusinessMonth', () => {
  const iso = (d: Date) => d.toISOString();

  it('usa el mes de la pared argentina, no el de UTC', () => {
    // 30/09 23:30 ART = 01/10 02:30 UTC. Pertenece a SEPTIEMBRE.
    const lateSeptember = new Date(Date.UTC(2026, 9, 1, 2, 30, 0));
    expect(iso(startOfBusinessMonth(lateSeptember))).toBe('2026-09-01T00:00:00.000Z');

    // 01/10 00:30 ART = 01/10 03:30 UTC. Pertenece a OCTUBRE.
    const earlyOctober = new Date(Date.UTC(2026, 9, 1, 3, 30, 0));
    expect(iso(startOfBusinessMonth(earlyOctober))).toBe('2026-10-01T00:00:00.000Z');
  });

  it('mantiene el formato de clave YYYY-MM-01T00:00:00Z', () => {
    const mid = new Date(Date.UTC(2026, 2, 15, 12, 0, 0));
    expect(iso(startOfBusinessMonth(mid))).toBe('2026-03-01T00:00:00.000Z');
  });

  it('cruza el año correctamente', () => {
    // 31/12 22:00 ART = 01/01 01:00 UTC del año siguiente → sigue siendo diciembre.
    const newYearEve = new Date(Date.UTC(2027, 0, 1, 1, 0, 0));
    expect(iso(startOfBusinessMonth(newYearEve))).toBe('2026-12-01T00:00:00.000Z');
  });
});

describe('addBusinessMonths', () => {
  const closedMonthFor = (isoDate: string) =>
    addBusinessMonths(startOfBusinessMonth(new Date(isoDate)), -1).toISOString().slice(0, 10);

  it('no desborda el día en meses cortos', () => {
    // Estos cuatro casos daban el mes EN CURSO con el cálculo viejo.
    expect(closedMonthFor('2026-03-31T12:00:00Z')).toBe('2026-02-01');
    expect(closedMonthFor('2026-05-31T12:00:00Z')).toBe('2026-04-01');
    expect(closedMonthFor('2026-07-31T12:00:00Z')).toBe('2026-06-01');
    expect(closedMonthFor('2026-03-15T12:00:00Z')).toBe('2026-02-01');
  });

  it('cruza el año hacia atrás y hacia adelante', () => {
    const jan = startOfBusinessMonth(new Date(Date.UTC(2026, 0, 10, 12)));
    expect(addBusinessMonths(jan, -1).toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(addBusinessMonths(jan, 12).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
