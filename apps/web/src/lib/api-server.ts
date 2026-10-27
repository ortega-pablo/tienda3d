import 'server-only';
import { cookies, headers as requestHeaders } from 'next/headers';
import { ApiError, apiErrorFromResponse, type ApiErrorCode } from '@tienda3d/shared';

/** `ApiError` y los códigos vienen de `@tienda3d/shared` — ver api-client.ts. */
export { ApiError };
export type { ApiErrorCode };

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://api:3001';

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  forwardCookies?: boolean;
}

/**
 * Server-side fetcher (RSC, route handlers, server actions).
 * Forwards request cookies so the API can authenticate the user.
 */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, forwardCookies = true, headers, ...rest } = options;

  const cookieHeader = forwardCookies
    ? (await cookies())
        .getAll()
        .map((c) => `${c.name}=${c.value}`)
        .join('; ')
    : '';

  // Si el request que se está renderizando trae un id, viaja a la API.
  const incomingId = (await requestHeaders()).get('x-request-id');

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(incomingId ? { 'x-request-id': incomingId } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    throw await apiErrorFromResponse(res);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return res.text() as unknown as T;
}
