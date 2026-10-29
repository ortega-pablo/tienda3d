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
  customer: { id: string; name: string; email: string | null; phone: string | null };
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
  items: WebOrderItemDto[];
  events: WebOrderEventDto[];
  /** Lo que el admin puede hacer ahora, según §5.6. */
  actions: {
    confirmTransfer: boolean;
    fulfillment: Array<Exclude<WebOrderFulfillmentValue, 'RECEIVED' | 'CANCELLED'>>;
    cancel: boolean;
  };
}

export interface WebOrderAttentionDto {
  count: number;
}
