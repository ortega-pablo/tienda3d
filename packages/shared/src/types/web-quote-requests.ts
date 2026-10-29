import type { WebQuoteRequestStatusValue } from '../schemas/web-quote-requests';

/** Una solicitud en el listado del panel (F15·3). */
export interface WebQuoteRequestSummaryDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** El comienzo de la idea, para reconocerla en la lista. */
  ideaPreview: string;
  status: WebQuoteRequestStatusValue;
  hasAttachment: boolean;
  requestedAt: string;
  quoteCode: string | null;
}

export interface WebQuoteRequestDetailDto extends WebQuoteRequestSummaryDto {
  idea: string;
  customerId: string;
  attachment: { name: string; type: string | null; size: number | null } | null;
  adminNote: string;
  quote: { id: string; code: string } | null;
}

export interface WebQuoteRequestCountDto {
  /** Las nuevas, sin mirar todavía. */
  count: number;
}
