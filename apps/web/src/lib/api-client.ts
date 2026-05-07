/**
 * Browser-side fetcher. Targets the Next.js /api proxy (same origin),
 * so httpOnly cookies are scoped to the web domain. Auto-refreshes on
 * 401 by calling /api/auth/refresh once and retrying.
 */

/** Mirror of the canonical backend error codes (apps/api/src/common/utils/error-codes.ts). */
export type ApiErrorCode =
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMIT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL'
  | 'NETWORK';

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(public readonly status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.code = (body?.code as ApiErrorCode) ?? deriveCodeFromStatus(status);
    this.details = body?.details;
  }
}

function deriveCodeFromStatus(status: number): ApiErrorCode {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 422) return 'VALIDATION';
  if (status === 429) return 'RATE_LIMIT';
  return 'INTERNAL';
}

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
    const text = await res.text();
    let parsed: ApiErrorBody | string;
    try {
      parsed = JSON.parse(text) as ApiErrorBody;
    } catch {
      parsed = text;
    }
    const body = typeof parsed === 'object' ? parsed : undefined;
    const message =
      (body && typeof body.message === 'string' && body.message) || `API ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
