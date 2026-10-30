import { Logger } from '@nestjs/common';
import { verifyEvent } from '@/common/integration-auth/event-signature';
import { StorefrontPaymentsClient } from './storefront-payments.client';

/** F22·2: la consulta al sitio va firmada y, si el sitio no responde, nada se da por listo. */
describe('StorefrontPaymentsClient', () => {
  const target = { url: 'http://storefront:3100/api/internal/payments/', secret: 's'.repeat(64) };
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('pregunta firmado y traduce la respuesta', async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(JSON.stringify({ methods: { MERCADOPAGO: true, MODO: false } }), {
          status: 200,
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new StorefrontPaymentsClient(target).readiness();
    expect(result).toEqual({ MERCADOPAGO: 'ready', MODO: 'missing', GOCUOTAS: 'missing' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(target.url);
    const headers = init.headers as Record<string, string>;
    expect(
      verifyEvent({
        secrets: [target.secret],
        timestamp: headers['x-tp-timestamp'],
        signature: headers['x-tp-signature'],
        body: String(init.body),
      }),
    ).toEqual({ ok: true });
  });

  const respondWith = (status: number, body: unknown) => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify(body), { status }));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  };
  const input = {
    externalId: 'pedido',
    amountCents: 1000,
    reason: 'Faltó una pieza',
    requestedBy: 'Ana',
  };

  it('pide el reembolso firmado, en la ruta interna del sitio (F22·5)', async () => {
    const fetchMock = respondWith(200, { ok: true, refundedCents: 1000 });
    expect(await new StorefrontPaymentsClient(target).refund(input)).toEqual({
      ok: true,
      refundedCents: 1000,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://storefront:3100/api/internal/payments/refund/');
    expect(JSON.parse(String(init.body))).toEqual(input);
    const headers = init.headers as Record<string, string>;
    expect(
      verifyEvent({
        secrets: [target.secret],
        timestamp: headers['x-tp-timestamp'],
        signature: headers['x-tp-signature'],
        body: String(init.body),
      }),
    ).toEqual({ ok: true });
  });

  it('un reembolso que el sitio rechaza trae su motivo', async () => {
    const refused = { ok: false, reason: 'TOO_MUCH', message: 'Se puede reembolsar hasta $ 1.' };
    respondWith(422, refused);
    expect(await new StorefrontPaymentsClient(target).refund(input)).toEqual(refused);
  });

  it('si no llega la respuesta del reembolso, no se da por hecho', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    respondWith(500, {});
    expect(await new StorefrontPaymentsClient(target).refund(input)).toMatchObject({
      ok: false,
      reason: 'UNREACHABLE',
    });
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await new StorefrontPaymentsClient(target).refund(input)).toMatchObject({
      ok: false,
      reason: 'UNREACHABLE',
    });
    expect(
      await new StorefrontPaymentsClient({ ...target, secret: undefined }).refund(input),
    ).toMatchObject({ ok: false, reason: 'UNREACHABLE' });
  });

  it('dispara la conciliación firmada; si el sitio no responde, null', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const fetchMock = respondWith(200, { checked: 3, failed: 0 });
    expect(await new StorefrontPaymentsClient(target).reconcile()).toEqual({
      checked: 3,
      failed: 0,
    });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://storefront:3100/api/internal/payments/reconcile/');
    respondWith(503, {});
    expect(await new StorefrontPaymentsClient(target).reconcile()).toBeNull();
    expect(await new StorefrontPaymentsClient({ ...target, secret: undefined }).reconcile()).toBe(
      null,
    );
  });

  it('si el sitio no responde, o sin secreto, todo queda sin confirmar', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const unknown = { MERCADOPAGO: 'unknown', MODO: 'unknown', GOCUOTAS: 'unknown' };
    expect(await new StorefrontPaymentsClient(target).readiness()).toEqual(unknown);
    expect(
      await new StorefrontPaymentsClient({ ...target, secret: undefined }).readiness(),
    ).toEqual(unknown);
  });
});
