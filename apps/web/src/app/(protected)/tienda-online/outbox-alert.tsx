import { AlertTriangle } from 'lucide-react';
import type { OutboxStatusDto } from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { formatDateTime } from '@/lib/format';

/**
 * Aviso de que el sitio no está recibiendo los cambios (plan F11·3): hay avisos
 * sin entregar hace más de 1 h o abandonados después de 48 h de reintentos.
 */
export async function OutboxAlert() {
  const status = await api<OutboxStatusDto>('/web-catalog/outbox').catch(() => null);
  if (!status || (status.stuck === 0 && status.failed === 0)) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="font-medium">El sitio no está recibiendo los cambios del sistema.</p>
        <p className="text-muted-foreground">
          {status.stuck > 0 &&
            `${status.stuck} aviso(s) sin entregar desde ${formatDateTime(status.oldestPendingAt)}. `}
          {status.failed > 0 && `${status.failed} aviso(s) se dejaron de reintentar a las 48 h. `}
          {status.lastError && `Último error: ${status.lastError}. `}
          Mientras tanto, la tienda puede mostrar datos de hasta 5 minutos atrás; revisá que el
          sitio esté andando.
        </p>
      </div>
    </div>
  );
}
