import type { WebAvailability, WebPriceState, WebProductStatus } from '@prisma/client';
import type {
  WebAvailabilityValue,
  WebPriceStateValue,
  WebProductStatusValue,
} from '@tienda3d/shared';

/**
 * Verificación en tiempo de compilación: los literales de la tienda online en
 * `shared` cubren exactamente los enums de Prisma. Si alguien agrega un estado
 * en el schema y no en shared —o al revés— esto no compila.
 */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _status: AssertEqual<WebProductStatusValue, WebProductStatus> = true;
const _availability: AssertEqual<WebAvailabilityValue, WebAvailability> = true;
const _priceState: AssertEqual<WebPriceStateValue, WebPriceState> = true;
void _status;
void _availability;
void _priceState;
