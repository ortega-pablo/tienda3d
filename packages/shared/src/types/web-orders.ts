import type {
  WebDeliveryMethodValue,
  WebOrderFulfillmentValue,
  WebOrderPaymentValue,
  WebPaymentMethodValue,
} from '../schemas/web-orders';

/** Un pedido web en el listado del panel (F14·5). Montos en centavos, como el sitio. */
export interface WebOrderSummaryDto {
  id: string;
  code: string;
  /** Número que ve el cliente (#1004). */
  number: number;
  customerName: string;
  customerEmail: string | null;
  paymentMethod: WebPaymentMethodValue;
  paymentStatus: WebOrderPaymentValue;
  fulfillmentStatus: WebOrderFulfillmentValue;
  deliveryMethod: WebDeliveryMethodValue;
  totalCents: number;
  /** Unidades en total. */
  units: number;
  placedAt: string;
  /** Espera algo del taller: confirmar la transferencia o empezar a prepararlo. */
  needsAttention: boolean;
}

/** Lo que eligió el cliente en una línea: producto, color u opción. */
export interface WebOrderSelectionDto {
  kind: 'member' | 'color' | 'attribute';
  label: string;
  value: string;
  valueKey: string;
  colorHex: string | null;
}

export interface WebOrderItemDto {
  id: string;
  webVariantId: string;
  productId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  selections: WebOrderSelectionDto[];
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** Unidades que salieron del stock; vuelven si se cancela. */
  reservedQuantity: number;
  productionOrderId: string | null;
  productionOrderCode: string | null;
}

export interface WebOrderEventDto {
  id: string;
  kind: string;
  message: string;
  /** Quién lo hizo en el panel; null si vino del sitio. */
  actorName: string | null;
  createdAt: string;
}

export interface WebOrderDetailDto extends WebOrderSummaryDto {
  /** `document`: el DNI o CUIT de la cuenta, para controlar quién retira (F22·3). */
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    document: string | null;
  };
  shipping: {
    street: string;
    number: string;
    apartment: string | null;
    city: string;
    province: string;
    postalCode: string;
  } | null;
  shippingLabel: string;
  /** Null: el envío se coordina con el cliente. */
  shippingCents: number | null;
  subtotalCents: number;
  customerNote: string;
  trackingCode: string | null;
  internalNotes: string;
  cancelReason: string | null;
  paidAt: string | null;
  /** Cobro manual (F22·3): monto confirmado y número de operación de la transferencia. */
  paidAmountCents: number | null;
  /** Cuánto se devolvió del pago (F22·5). */
  refundedCents: number;
  paymentReference: string | null;
  /** Hasta cuándo se puede pagar (F22·4); null en los pedidos de antes. */
  paymentDueAt: string | null;
  items: WebOrderItemDto[];
  events: WebOrderEventDto[];
  /** Lo que el admin puede hacer ahora, según §5.6. */
  actions: {
    confirmTransfer: boolean;
    /** Cobrar en efectivo: pedido en efectivo con retiro, esperando el pago (F22·3). */
    confirmCash: boolean;
    /** Darle 48 h más para pagar (F22·4). */
    extendPayment: boolean;
    /** Reembolsar el pago: uno en línea acreditado (F22·5). */
    refund: boolean;
    /** Se puede generar la orden de producción de los ítems que no la tienen (F14·7). */
    production: boolean;
    fulfillment: Array<Exclude<WebOrderFulfillmentValue, 'RECEIVED' | 'CANCELLED'>>;
    cancel: boolean;
  };
}

export interface WebOrderAttentionDto {
  count: number;
}

/** Lo que se va a fabricar para un ítem, antes de generar la orden (F14·7). */
export interface WebOrderProductionPlanDto {
  itemId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  /** Lo que no sale del stock: lo que hay que fabricar. */
  suggestedQuantity: number;
  pieces: Array<{
    pieceId: string;
    pieceName: string;
    /** El color que lleva (el elegido por el cliente); null si no lleva color. */
    colorName: string | null;
    colorHex: string | null;
  }>;
  /** Piezas que necesitan color y ninguna opción de la publicación lo define. */
  missing: string[];
}
