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
