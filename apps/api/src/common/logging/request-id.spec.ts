import type { IncomingMessage, ServerResponse } from 'node:http';
import { requestId } from './request-id';

function call(header?: string) {
  const req = {
    headers: header === undefined ? {} : { 'x-request-id': header },
  } as IncomingMessage;
  const setHeader = jest.fn();
  const id = requestId(req, { setHeader } as unknown as ServerResponse);
  return { id, setHeader };
}

describe('requestId', () => {
  it('usa el x-request-id que llega y lo devuelve en la respuesta', () => {
    const { id, setHeader } = call('prueba-123');
    expect(id).toBe('prueba-123');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'prueba-123');
  });

  it('genera uno si no llega', () => {
    const { id } = call();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('descarta un id con caracteres que ensuciarían los logs', () => {
    expect(call('abc\n{"nivel":"falso"}').id).not.toContain('falso');
    expect(call('x'.repeat(200)).id).toHaveLength(36);
  });
});
