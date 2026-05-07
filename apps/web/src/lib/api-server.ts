import 'server-only';
import { cookies } from 'next/headers';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://api:3001';

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

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    let parsed: ApiErrorBody | string;
    try {
      parsed = JSON.parse(text) as ApiErrorBody;
    } catch {
      parsed = text;
    }
    const errBody = typeof parsed === 'object' ? parsed : undefined;
    const message =
      (errBody && typeof errBody.message === 'string' && errBody.message) || `API ${res.status}`;
    throw new ApiError(res.status, message, errBody);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return res.text() as unknown as T;
}
