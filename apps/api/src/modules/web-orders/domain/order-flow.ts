import type {
  WebDeliveryMethodValue as Delivery,
  WebOrderFulfillmentValue as Fulfillment,
  WebOrderPaymentValue as Payment,
  WebPaymentMethodValue as PaymentMethod,
} from '@tienda3d/shared';

/**
 * Qué puede hacer el admin con un pedido web (plan §5.6). Portado de las
 * transiciones del panel viejo del sitio (`ADMIN_TRANSITIONS`), que también usa
 * el sitio para validar lo que le llega (storefront `domain/orders.ts`).
 */

export interface OrderState {
  paymentMethod: PaymentMethod;
  paymentStatus: Payment;
  fulfillmentStatus: Fulfillment;
  deliveryMethod: Delivery;
}

const TRANSITIONS: Record<Fulfillment, Fulfillment[]> = {
  RECEIVED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'SHIPPED', 'CANCELLED'],
  READY_FOR_PICKUP: ['DELIVERED', 'PREPARING', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'PREPARING'],
  DELIVERED: [],
  CANCELLED: [],
};

/** A qué puede pasar la preparación: según la entrega y solo con el pago aprobado. */
export function allowedFulfillments(order: OrderState): Fulfillment[] {
  return TRANSITIONS[order.fulfillmentStatus].filter((next) => {
    if (next === 'SHIPPED' && order.deliveryMethod === 'PICKUP') return false;
    if (next === 'READY_FOR_PICKUP' && order.deliveryMethod === 'SHIPPING') return false;
    // Preparar exige el pago aprobado; cancelar se puede hasta que sale del taller.
    if (next !== 'CANCELLED' && order.paymentStatus !== 'APPROVED') return false;
    return true;
  });
}

export function canMoveFulfillment(order: OrderState, to: Fulfillment): boolean {
  return allowedFulfillments(order).includes(to);
}

/** La transferencia la confirma el admin al ver el comprobante (D7). */
export function canConfirmTransfer(order: OrderState): boolean {
  return (
    order.paymentMethod === 'BANK_TRANSFER' &&
    order.paymentStatus === 'AWAITING_TRANSFER' &&
    order.fulfillmentStatus !== 'CANCELLED'
  );
}

/**
 * Espera algo del taller: confirmar la transferencia o empezar a prepararlo.
 * Un pago de Mercado Pago pendiente o rechazado espera al cliente, no al taller.
 */
export function needsAttention(order: Pick<OrderState, 'paymentStatus' | 'fulfillmentStatus'>) {
  return (
    order.fulfillmentStatus === 'RECEIVED' &&
    (order.paymentStatus === 'AWAITING_TRANSFER' || order.paymentStatus === 'APPROVED')
  );
}

/** Cómo se lee cada etapa en el historial del pedido. */
export const FULFILLMENT_LABEL: Record<Fulfillment, string> = {
  RECEIVED: 'Recibido',
  PREPARING: 'En preparación',
  READY_FOR_PICKUP: 'Listo para retirar',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

/** Se fabrica lo pagado que todavía no salió del taller (§5.6). */
export function canStartProduction(order: Pick<OrderState, 'paymentStatus' | 'fulfillmentStatus'>) {
  return (
    order.paymentStatus === 'APPROVED' &&
    (order.fulfillmentStatus === 'RECEIVED' || order.fulfillmentStatus === 'PREPARING')
  );
}

/** Una pieza del producto: si su filamento tiene colores, hay que elegirle uno. */
export interface PieceToPaint {
  id: string;
  needsColor: boolean;
}

/** Un color que eligió el cliente y las piezas que lo toman (las de su opción de color). */
export interface ChosenColor {
  materialId: string;
  pieceIds: string[];
}

/**
 * Los `filamentOverrides` de la orden de producción de un ítem (F14·7): cada
 * pieza del producto toma el color elegido en la opción que la pinta. Las
 * piezas con colores que ninguna opción cubre quedan en `missing`.
 */
export function productionColors(
  pieces: PieceToPaint[],
  chosen: ChosenColor[],
): { overrides: Record<string, string>; missing: string[] } {
  const ids = new Set(pieces.map((p) => p.id));
  const overrides: Record<string, string> = {};
  for (const color of chosen) {
    for (const pieceId of color.pieceIds)
      if (ids.has(pieceId)) overrides[pieceId] = color.materialId;
  }
  const missing = pieces.filter((p) => p.needsColor && !overrides[p.id]).map((p) => p.id);
  return { overrides, missing };
}
