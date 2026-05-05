import { cn } from '@/lib/utils';

const STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SENT: 'bg-primary/10 text-primary',
  ACCEPTED: 'bg-success/10 text-success',
  REJECTED: 'bg-destructive/10 text-destructive',
  EXPIRED: 'bg-warning/10 text-warning',

  PLANNED: 'bg-muted text-muted-foreground',
  IN_PROGRESS: 'bg-primary/10 text-primary',
  DONE: 'bg-success/10 text-success',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

const LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
  PLANNED: 'Planeada',
  IN_PROGRESS: 'En curso',
  DONE: 'Completada',
  CANCELLED: 'Cancelada',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
        STYLES[status] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
