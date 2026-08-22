/**
 * Browser-side fetcher. Targets the Next.js /api proxy (same origin),
 * so httpOnly cookies are scoped to the web domain. Auto-refreshes on
 * 401 by calling /api/auth/refresh once and retrying.
 *
 * `ApiError` y los códigos de error viven en `@tienda3d/shared`: eran una copia
 * literal de los de api-server.ts y de los del backend, y el typecheck no
 * detectaba que se separaran. Se re-exportan para no tocar los ~30 componentes
 * que los importan desde acá.
 */
import { ApiError, apiErrorFromResponse, type ApiErrorCode } from '@tienda3d/shared';

export { ApiError };
export type { ApiErrorCode };

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * Single-flight refresh: many parallel 401s share one /auth/refresh call so
 * we don't fire it N times. The middleware refreshes proactively before token
 * expiry, but a request that started just before expiration can still race
 * past it — that's what this fallback is for.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const send = (): Promise<Response> =>
    fetch(`/api${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send();

  // Auto-refresh on expired access. Skip /auth/* to avoid loops.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      res = await send();
    } else if (typeof window !== 'undefined') {
      // Refresh token also dead — kick the user back to login with a return path.
      // Using replace() so the failed action doesn't end up in browser history.
      const next = window.location.pathname + window.location.search;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
      // Hang the promise so the caller never sees the 401 mid-redirect.
      return new Promise<T>(() => {});
    }
  }

  if (!res.ok) {
    throw await apiErrorFromResponse(res);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
