import { addBusinessDays } from './date';

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
