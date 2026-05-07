/**
 * Canonical error codes returned by the API. The frontend maps these to
 * user-facing messages (and toasts). Add new codes here, never inline strings.
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
