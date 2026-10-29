import type {
  WebDeliveryMethodValue,
  WebOrderFulfillmentValue,
  WebOrderPaymentValue,
  WebPaymentMethodValue,
} from '@tienda3d/shared';
import type { BadgeProps } from '@/components/ui/badge';
import { formatMoney } from '@/lib/format';

type Variant = NonNullable<BadgeProps['variant']>;

/** El pago, como lo ve el admin (§5.6). */
export const PAYMENT_LABEL: Record<WebOrderPaymentValue, { label: string; variant: Variant }> = {
  PENDING: { label: 'Pago pendiente', variant: 'outline' },
  AWAITING_TRANSFER: { label: 'Esperando transferencia', variant: 'warning' },
  AWAITING_CASH: { label: 'A pagar en el local', variant: 'warning' },
  APPROVED: { label: 'Pagado', variant: 'success' },
  REJECTED: { label: 'Pago rechazado', variant: 'destructive' },
  REFUNDED: { label: 'Reembolsado', variant: 'secondary' },
};

export const FULFILLMENT_LABEL: Record<
  WebOrderFulfillmentValue,
  { label: string; variant: Variant }
> = {
  RECEIVED: { label: 'Recibido', variant: 'secondary' },
  PREPARING: { label: 'En preparación', variant: 'default' },
  READY_FOR_PICKUP: { label: 'Listo para retirar', variant: 'success' },
  SHIPPED: { label: 'Enviado', variant: 'success' },
  DELIVERED: { label: 'Entregado', variant: 'outline' },
  CANCELLED: { label: 'Cancelado', variant: 'destructive' },
};

export const METHOD_LABEL: Record<WebPaymentMethodValue, string> = {
  MERCADOPAGO: 'Mercado Pago',
  BANK_TRANSFER: 'Transferencia',
  CASH: 'Efectivo en el local',
  MODO: 'MODO',
  GOCUOTAS: 'Go Cuotas',
};

export const DELIVERY_LABEL: Record<WebDeliveryMethodValue, string> = {
  PICKUP: 'Retiro por el taller',
  SHIPPING: 'Envío',
};

/** Los pedidos web van en centavos, como en el sitio. */
export const formatCents = (cents: number) => formatMoney(cents / 100);
