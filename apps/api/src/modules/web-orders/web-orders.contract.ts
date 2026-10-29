import type {
  WebDeliveryMethod,
  WebOrderFulfillment,
  WebOrderPayment,
  WebPaymentMethod,
} from '@prisma/client';
import type {
  WebDeliveryMethodValue,
  WebOrderFulfillmentValue,
  WebOrderPaymentValue,
  WebPaymentMethodValue,
} from '@tienda3d/shared';

/** Los literales de los pedidos web en `shared` cubren exactamente los enums de Prisma. */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _payment: AssertEqual<WebOrderPaymentValue, WebOrderPayment> = true;
const _fulfillment: AssertEqual<WebOrderFulfillmentValue, WebOrderFulfillment> = true;
const _method: AssertEqual<WebPaymentMethodValue, WebPaymentMethod> = true;
const _delivery: AssertEqual<WebDeliveryMethodValue, WebDeliveryMethod> = true;
void _payment;
void _fulfillment;
void _method;
void _delivery;
