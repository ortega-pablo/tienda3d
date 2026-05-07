'use client';

import { toast } from 'sonner';
import { ApiError, type ApiErrorCode } from './api-client';

interface HandleErrorOptions {
  /** Sobreescribe el mensaje genérico que muestra el toast. */
  fallback?: string;
  /** Si false, NO se dispara toast — útil cuando el caller muestra el error inline. */
  toast?: boolean;
}

/** Default human-friendly message per error code (Spanish). */
const CODE_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION: 'Algunos campos no son válidos. Revisalos e intentá de nuevo.',
  CONFLICT: 'La operación entra en conflicto con datos existentes.',
  NOT_FOUND: 'No se encontró el recurso solicitado.',
  BAD_REQUEST: 'La solicitud tiene datos inválidos.',
  UNAUTHORIZED: 'Tu sesión expiró. Iniciá sesión de nuevo.',
  FORBIDDEN: 'No tenés permisos para esta acción.',
  RATE_LIMIT: 'Demasiadas solicitudes. Esperá unos segundos e intentá de nuevo.',
  PAYLOAD_TOO_LARGE: 'El archivo o los datos enviados son demasiado grandes.',
  INTERNAL: 'Ocurrió un error interno. Volvé a intentar; si persiste, avisá al equipo.',
  NETWORK: 'No se pudo conectar al servidor. Revisá tu conexión.',
};

/**
 * Centralized error handler for client-side fetches. Always returns the
 * resolved message string (so callers can ALSO show it inline if they want).
 *
 * Usage:
 *   try { await api(...) } catch (e) { handleApiError(e); }
 */
export function handleApiError(err: unknown, opts: HandleErrorOptions = {}): string {
  const { fallback, toast: showToast = true } = opts;
  const message = resolveMessage(err, fallback);

  if (showToast) {
    toast.error(message);
  }
  return message;
}

function resolveMessage(err: unknown, fallback?: string): string {
  if (err instanceof ApiError) {
    // Prefer the message the backend sent. Fall back to code-driven default.
    return err.message || CODE_MESSAGES[err.code] || fallback || 'Error';
  }
  if (err instanceof Error) {
    return err.message || fallback || 'Error';
  }
  return fallback || 'Error inesperado';
}

export { CODE_MESSAGES };
