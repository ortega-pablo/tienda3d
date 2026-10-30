import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnlinePaymentMethod, PaymentReadiness } from '@tienda3d/shared';
import { ONLINE_PAYMENT_METHODS } from '@tienda3d/shared';
import { signEvent } from '@/common/integration-auth/event-signature';

export const STOREFRONT_PAYMENTS_TARGET = Symbol('STOREFRONT_PAYMENTS_TARGET');

export interface StorefrontPaymentsTarget {
  /** `POST /api/internal/payments/` del sitio, por la red interna. */
  url: string;
  secret: string | undefined;
}

const TIMEOUT_MS = 3000;

export type PaymentsReadiness = Record<OnlinePaymentMethod, PaymentReadiness>;

const UNKNOWN: PaymentsReadiness = { MERCADOPAGO: 'unknown', MODO: 'unknown', GOCUOTAS: 'unknown' };

/**
 * Le pregunta al sitio si tiene las credenciales de cada medio en línea (F22·2):
 * el panel no deja prender uno que el sitio no puede cobrar. La consulta va
 * firmada como los avisos (F11·2); si el sitio no responde, todo queda `unknown`.
 */
@Injectable()
export class StorefrontPaymentsClient {
  private readonly logger = new Logger(StorefrontPaymentsClient.name);

  constructor(
    @Inject(STOREFRONT_PAYMENTS_TARGET) private readonly target: StorefrontPaymentsTarget,
  ) {}

  async readiness(): Promise<PaymentsReadiness> {
    if (!this.target.secret) return UNKNOWN;
    const body = JSON.stringify({ event: 'payments.readiness' });
    const timestamp = Math.floor(Date.now() / 1000);
    try {
      const res = await fetch(this.target.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tp-timestamp': String(timestamp),
          'x-tp-signature': signEvent(this.target.secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { methods } = (await res.json()) as { methods?: Record<string, unknown> };
      return Object.fromEntries(
        ONLINE_PAYMENT_METHODS.map((m) => [m, methods?.[m] === true ? 'ready' : 'missing']),
      ) as PaymentsReadiness;
    } catch (error) {
      this.logger.warn(
        `El sitio no informó sus medios de pago: ${error instanceof Error ? error.message : error}`,
      );
      return UNKNOWN;
    }
  }
}
