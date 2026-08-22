/**
 * Códigos de error de la API — fuente única para backend y frontend.
 *
 * Vivían duplicados en tres archivos: `apps/api/src/common/utils/error-codes.ts`
 * (el enum que emite el filtro global), `apps/web/src/lib/api-client.ts` y
 * `apps/web/src/lib/api-server.ts` (la unión que consumen los fetchers), más una
 * copia de `deriveCodeFromStatus` en cada fetcher. El typecheck pasaba porque
 * las copias coincidían; agregar un código nuevo al backend no producía ningún
 * error en web hasta que algo llegaba sin traducir a la pantalla.
 */

export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT: 'RATE_LIMIT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Códigos que puede ver el cliente. Incluye `NETWORK`, que el backend nunca
 * emite: lo produce el fetcher del navegador cuando no llega a la API.
 */
export type ApiErrorCode = ErrorCode | 'NETWORK';

/** Cuerpo de error que devuelve el filtro global de la API. */
export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

/** Código correspondiente a un status HTTP, para respuestas sin envelope. */
export function deriveCodeFromStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.BAD_REQUEST;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 413:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    case 422:
      return ErrorCode.VALIDATION;
    case 429:
      return ErrorCode.RATE_LIMIT;
    default:
      return ErrorCode.INTERNAL;
  }
}

/** Error tipado que lanzan los fetchers del frontend. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(
    readonly status: number,
    message: string,
    body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = (body?.code as ApiErrorCode) ?? deriveCodeFromStatus(status);
    this.details = body?.details;
  }
}

/**
 * Lo mínimo que necesitamos de una respuesta HTTP. Tipado estructural en vez de
 * `Response` para que este paquete no dependa de la lib DOM: lo importan tanto
 * el backend (Node) como el frontend.
 */
export interface ErrorResponseLike {
  status: number;
  text: () => Promise<string>;
}

/**
 * Convierte una respuesta fallida en un `ApiError`. Los dos fetchers hacían
 * exactamente esto, con el mismo código copiado.
 */
export async function apiErrorFromResponse(res: ErrorResponseLike): Promise<ApiError> {
  const text = await res.text();
  let parsed: ApiErrorBody | string;
  try {
    parsed = JSON.parse(text) as ApiErrorBody;
  } catch {
    parsed = text;
  }
  const body = typeof parsed === 'object' ? parsed : undefined;
  const message = (body && typeof body.message === 'string' && body.message) || `API ${res.status}`;
  return new ApiError(res.status, message, body);
}
