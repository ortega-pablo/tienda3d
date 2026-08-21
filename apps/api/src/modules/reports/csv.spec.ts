import { toCsv } from './csv.service';

describe('toCsv', () => {
  it('neutraliza fórmulas para que Excel no las ejecute', () => {
    const csv = toCsv([
      { Cliente: '=HYPERLINK("http://malo","click")', Total: '100.00' },
      { Cliente: '+1234', Total: '0.00' },
      { Cliente: '-SUM(A1:A9)', Total: '0.00' },
      { Cliente: '@import', Total: '0.00' },
    ]);
    const rows = csv.split('\n').slice(1);
    expect(rows[0]!.startsWith('"\'=HYPERLINK')).toBe(true);
    expect(rows[1]).toBe("'+1234,0.00");
    expect(rows[2]).toBe("'-SUM(A1:A9),0.00");
    expect(rows[3]).toBe("'@import,0.00");
  });

  it('no toca los valores normales', () => {
    const csv = toCsv([{ Cliente: 'Juan Pérez', Total: '1500.50' }]);
    expect(csv).toBe('Cliente,Total\nJuan Pérez,1500.50');
  });

  it('sigue escapando comillas y saltos de línea', () => {
    const csv = toCsv([{ Notas: 'dijo "hola"\ny se fue' }]);
    expect(csv).toBe('Notas\n"dijo ""hola""\ny se fue"');
  });
});
