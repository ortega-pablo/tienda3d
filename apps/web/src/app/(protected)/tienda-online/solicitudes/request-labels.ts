import type { WebQuoteRequestStatusValue } from '@tienda3d/shared';
import type { BadgeProps } from '@/components/ui/badge';

type Variant = NonNullable<BadgeProps['variant']>;

/** El estado de una solicitud, como lo ve el admin; el cliente lo ve en Mi cuenta (F15·4). */
export const REQUEST_STATUS: Record<
  WebQuoteRequestStatusValue,
  { label: string; variant: Variant }
> = {
  NEW: { label: 'Nueva', variant: 'warning' },
  IN_REVIEW: { label: 'En análisis', variant: 'default' },
  QUOTED: { label: 'Cotizada', variant: 'success' },
  DISCARDED: { label: 'Descartada', variant: 'outline' },
};
