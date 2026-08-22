/**
 * DTOs de cotizaciones. La definición vive en `@tienda3d/shared` para que web
 * consuma exactamente la misma forma; acá se fijan con `Date` porque es lo que
 * produce el backend antes de serializar (en el navegador llegan como strings,
 * que es el default del tipo genérico).
 */
import type {
  QuoteDto as SharedQuoteDto,
  QuoteSummaryDto as SharedQuoteSummaryDto,
} from '@tienda3d/shared';

export type {
  AdhocItemPayload,
  QuoteItemDto,
  QuoteItemPricingBreakdown,
  QuoteItemPricingContext,
} from '@tienda3d/shared';

export type QuoteSummaryDto = SharedQuoteSummaryDto<Date>;
export type QuoteDto = SharedQuoteDto<Date>;

export type { QuoteCreateInput, QuoteItemInput } from './quotes.input';
