import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Firma de los avisos entre el sistema y el sitio (plan F11·2, §5.5):
 *
 *   X-TP-Timestamp: <segundos Unix>
 *   X-TP-Signature: v1=<hex(HMAC-SHA256(secreto, timestamp + "." + cuerpo))>
 *
 * El cuerpo son los bytes exactos que viajan (UTF-8). La misma función vive en
 * el sitio (storefront/src/server/events/signature.ts) y las dos pasan los
 * vectores de docs/contrato-storefront-v1.md.
 */

/** Diferencia máxima entre el timestamp del aviso y el reloj del que lo recibe. */
export const EVENT_WINDOW_SECONDS = 5 * 60;

export function signEvent(secret: string, timestamp: string | number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `v1=${mac}`;
}

export type EventVerification =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'bad-signature' };

/**
 * Verifica un aviso recibido. Acepta varios secretos para poder rotarlos sin
 * cortar: vale si coincide con cualquiera.
 */
export function verifyEvent(input: {
  secrets: string[];
  timestamp: string | undefined;
  signature: string | undefined;
  body: string;
  /** Segundos Unix de ahora (para los tests). */
  now?: number;
}): EventVerification {
  const { secrets, timestamp, signature, body } = input;
  if (!timestamp || !signature) return { ok: false, reason: 'missing' };
  if (!/^\d{1,12}$/.test(timestamp) || !/^v1=[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, reason: 'malformed' };
  }
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > EVENT_WINDOW_SECONDS)
    return { ok: false, reason: 'stale' };

  const received = Buffer.from(signature.slice(3), 'hex');
  // Se prueban todos los secretos para que el tiempo no diga cuál coincidió.
  let valid = false;
  for (const secret of secrets) {
    const expected = Buffer.from(signEvent(secret, timestamp, body).slice(3), 'hex');
    if (timingSafeEqual(expected, received)) valid = true;
  }
  return valid ? { ok: true } : { ok: false, reason: 'bad-signature' };
}
