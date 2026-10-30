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

/**
 * Cómo empieza el pago de cada medio (F22·2): la transferencia y el efectivo
 * esperan al admin; los medios en línea, al proveedor.
 */
export function initialPayment(method: PaymentMethod): Payment {
  if (method === 'BANK_TRANSFER') return 'AWAITING_TRANSFER';
  if (method === 'CASH') return 'AWAITING_CASH';
  return 'PENDING';
}

/** Por qué un pedido no puede empezar así, o null. El efectivo es solo con retiro (D19). */
export function paymentStartIssue(
  order: Pick<OrderState, 'paymentMethod' | 'paymentStatus' | 'deliveryMethod'>,
): string | null {
  if (order.paymentStatus !== initialPayment(order.paymentMethod)) {
    return 'El estado del pago no corresponde al medio elegido.';
  }
  if (order.paymentMethod === 'CASH' && order.deliveryMethod !== 'PICKUP') {
    return 'El efectivo es solo con retiro por el taller.';
  }
  return null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Plazos para pagar (F22·4, D19): 48 h en efectivo o transferencia, con aviso
 * 24 h antes; 2 h en un medio en línea (el link de pago vence a los 30 min).
 */
export const MANUAL_PAYMENT_WINDOW_MS = 48 * HOUR_MS;
export const ONLINE_PAYMENT_WINDOW_MS = 2 * HOUR_MS;
export const PAYMENT_REMINDER_BEFORE_MS = 24 * HOUR_MS;
/** Lo que el admin suma desde el panel. */
export const PAYMENT_EXTENSION_MS = 48 * HOUR_MS;

export function isManualMethod(method: PaymentMethod): boolean {
  return method === 'BANK_TRANSFER' || method === 'CASH';
}

/** Hasta cuándo se puede pagar un pedido hecho en `placedAt`. */
export function paymentDueAt(method: PaymentMethod, placedAt: Date): Date {
  const window = isManualMethod(method) ? MANUAL_PAYMENT_WINDOW_MS : ONLINE_PAYMENT_WINDOW_MS;
  return new Date(placedAt.getTime() + window);
}

/** Un pedido que todavía espera el pago (y que, por eso, puede vencer). */
export const UNPAID: Payment[] = ['PENDING', 'AWAITING_TRANSFER', 'AWAITING_CASH', 'REJECTED'];

/** El admin puede darle 48 h más a un pedido sin pagar que no salió del taller. */
export function canExtendPayment(order: Pick<OrderState, 'paymentStatus' | 'fulfillmentStatus'>) {
  return UNPAID.includes(order.paymentStatus) && order.fulfillmentStatus === 'RECEIVED';
}

/** El efectivo se cobra al retirar: solo en un pedido con retiro que espera el pago (F22·3). */
export function canConfirmCash(order: OrderState): boolean {
  return (
    order.paymentMethod === 'CASH' &&
    order.paymentStatus === 'AWAITING_CASH' &&
    order.deliveryMethod === 'PICKUP' &&
    order.fulfillmentStatus !== 'CANCELLED'
  );
}

/** La transferencia la confirma el admin al verla acreditada en el banco (D7, F22·3). */
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
