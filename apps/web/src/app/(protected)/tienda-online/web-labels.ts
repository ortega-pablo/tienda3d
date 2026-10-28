import type { WebProductAlert, WebProductStatusValue } from '@tienda3d/shared';
import type { BadgeProps } from '@/components/ui/badge';

type Variant = NonNullable<BadgeProps['variant']>;

/** Estado de una publicación, como lo ve el admin. */
export const STATUS_LABEL: Record<WebProductStatusValue, { label: string; variant: Variant }> = {
  DRAFT: { label: 'Borrador', variant: 'secondary' },
  PUBLISHED: { label: 'Publicada', variant: 'success' },
  HIDDEN: { label: 'Oculta', variant: 'outline' },
};

/** Lo que falta o hay que corregir (F7·4). */
export const ALERT_LABEL: Record<WebProductAlert, { label: string; variant: Variant }> = {
  NO_PRICE: { label: 'Sin precio', variant: 'destructive' },
  INACTIVE_COLOR: { label: 'Color inactivo', variant: 'warning' },
  NO_IMAGES: { label: 'Sin fotos', variant: 'warning' },
  NO_VARIANTS: { label: 'Sin variantes', variant: 'warning' },
};
