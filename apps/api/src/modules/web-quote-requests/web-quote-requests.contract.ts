import type { WebQuoteRequestStatus } from '@prisma/client';
import type { WebQuoteRequestStatusValue } from '@tienda3d/shared';

/** Los estados de `shared` cubren exactamente el enum de Prisma. */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _status: AssertEqual<WebQuoteRequestStatusValue, WebQuoteRequestStatus> = true;
void _status;
