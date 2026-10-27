import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Formato aceptado para un id que viene de afuera: corto y sin caracteres que ensucien los logs. */
const VALID_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Id del request para los logs (`genReqId` de pino-http). Usa el
 * `x-request-id` que llega —del proxy del panel o del sitio— si tiene un
 * formato válido; si no, genera uno. Lo devuelve en la respuesta, así un
 * pedido se puede seguir en los logs de los dos sistemas con el mismo id.
 */
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}
