'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Next.js segment-level error boundary. Catches errors thrown during render
 * of any page inside (protected) — including the ApiError when /auth/me hits
 * a 429 or any other server-side fetch fails. The provided `reset()` retries
 * the segment without a full page reload.
 *
 * Errors thrown inside this file itself escalate to the root error.tsx (or
 * the default Next error UI), so we keep this minimal.
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to dev console; production should forward to error tracking.
    console.error('ProtectedError caught:', error);
  }, [error]);

  const isRateLimit = /too many requests|rate.?limit/i.test(error.message);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold">Algo falló al cargar esta sección</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {isRateLimit
            ? 'Hiciste muchas solicitudes en poco tiempo. Esperá unos segundos y reintentá.'
            : error.message || 'Error inesperado.'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60">digest: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="default">
          <RotateCw className="h-4 w-4" />
          Reintentar
        </Button>
        <Button asChild variant="outline">
          <a href="/dashboard">Ir al panel</a>
        </Button>
      </div>
    </div>
  );
}
