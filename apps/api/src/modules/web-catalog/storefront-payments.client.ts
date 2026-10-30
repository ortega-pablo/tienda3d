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
/** El reembolso espera a Mercado Pago, que tiene 10 s por llamada. */
const REFUND_TIMEOUT_MS = 25_000;
/** Conciliar recorre los pedidos recientes de a uno. */
const RECONCILE_TIMEOUT_MS = 120_000;

export type PaymentsReadiness = Record<OnlinePaymentMethod, PaymentReadiness>;

export interface RefundRequest {
  externalId: string;
  /** Sin monto, todo lo que queda por devolver. */
  amountCents?: number;
  reason: string;
  requestedBy: string;
}

export type RefundResult =
  | { ok: true; refundedCents: number }
  | { ok: false; reason: string; message: string };

export interface ReconcileResult {
  checked: number;
  failed: number;
}

const UNKNOWN: PaymentsReadiness = { MERCADOPAGO: 'unknown', MODO: 'unknown', GOCUOTAS: 'unknown' };

/**
 * Lo que el panel le pide al sitio sobre los pagos, firmado como los avisos (F11·2).
 * Sus credenciales (F22·2): el panel no deja prender un medio que el sitio no puede
 * cobrar y, si el sitio no responde, todo queda `unknown`. Reembolsar y conciliar
 * (F22·5): el dueño del pago es el sitio.
 */
@Injectable()
export class StorefrontPaymentsClient {
  private readonly logger = new Logger(StorefrontPaymentsClient.name);

  constructor(
    @Inject(STOREFRONT_PAYMENTS_TARGET) private readonly target: StorefrontPaymentsTarget,
  ) {}

  async readiness(): Promise<PaymentsReadiness> {
    if (!this.target.secret) return UNKNOWN;
    try {
      const res = await this.post(this.target.url, { event: 'payments.readiness' }, TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { methods } = (await res.json()) as { methods?: Record<string, unknown> };
      return Object.fromEntries(
        ONLINE_PAYMENT_METHODS.map((m) => [m, methods?.[m] === true ? 'ready' : 'missing']),
      ) as PaymentsReadiness;
    } catch (error) {
      this.logger.warn(`El sitio no informó sus medios de pago: ${message(error)}`);
      return UNKNOWN;
    }
  }

  /**
   * Pide un reembolso (F22·5) y responde lo que hizo el proveedor. Si la respuesta
   * no llega, no se sabe si se hizo: por eso el mensaje manda a revisar antes de
   * reintentar, aunque el sitio no devuelve dos veces el mismo pedido.
   */
  async refund(input: RefundRequest): Promise<RefundResult> {
    const unknown: RefundResult = {
      ok: false,
      reason: 'UNREACHABLE',
      message: 'No pudimos confirmar el reembolso con la tienda. Revisalo antes de reintentar.',
    };
    if (!this.target.secret) return unknown;
    try {
      const res = await this.post(this.url('refund/'), input, REFUND_TIMEOUT_MS);
      if (res.status !== 200 && res.status !== 422) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as RefundResult;
    } catch (error) {
      this.logger.error(`El sitio no respondió el reembolso: ${message(error)}`);
      return unknown;
    }
  }

  /** Dispara la conciliación de pagos del sitio; null si no respondió. */
  async reconcile(): Promise<ReconcileResult | null> {
    if (!this.target.secret) return null;
    try {
      const res = await this.post(
        this.url('reconcile/'),
        { event: 'payments.reconcile' },
        RECONCILE_TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ReconcileResult;
    } catch (error) {
      this.logger.warn(`El sitio no concilió los pagos: ${message(error)}`);
      return null;
    }
  }

  private url(path: string): string {
    return new URL(path, this.target.url).toString();
  }

  /** Va firmado como los avisos: quien la recibe no confía en nada sin firma. */
  private post(url: string, payload: object, timeoutMs: number): Promise<Response> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tp-timestamp': String(timestamp),
        'x-tp-signature': signEvent(this.target.secret!, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
