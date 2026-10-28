import { EVENT_WINDOW_SECONDS, signEvent, verifyEvent } from './event-signature';

/**
 * Vectores de docs/contrato-storefront-v1.md (calculados con Node y verificados
 * con openssl). El sitio prueba los mismos en storefront/tests/unit/event-signature.test.ts.
 */
const VECTORS = [
  {
    secret: 'tp-test-secret-1',
    timestamp: '1793200000',
    body: '{"event":"catalog.changed","scope":"product","ids":["lampara-trapecio"]}',
    signature: 'v1=eac227acb4424f19f7aee8e9de1e44b106e6f1731cc5930d99c79289de2e6d8c',
  },
  {
    secret: 'tp-test-secret-1',
    timestamp: '1793200000',
    body: '',
    signature: 'v1=404e8b1ad6acdb72b6a875135c22b6b580b9df16dcf8a98bce2a938d910b7550',
  },
  {
    secret: 'tp-test-secret-2',
    timestamp: '1793200123',
    body: '{"event":"order.created","externalId":"TP-000123","note":"Lámpara año"}',
    signature: 'v1=6c7224609ddf8dc81ccc5bb46c4fddc77d0552ed957311f4f3adbe86623c083b',
  },
];

describe('firma de los avisos', () => {
  it.each(VECTORS)('reproduce el vector $signature', (v) => {
    expect(signEvent(v.secret, v.timestamp, v.body)).toBe(v.signature);
    expect(
      verifyEvent({
        secrets: [v.secret],
        timestamp: v.timestamp,
        signature: v.signature,
        body: v.body,
        now: Number(v.timestamp),
      }),
    ).toEqual({ ok: true });
  });

  const v = VECTORS[0]!;
  const now = Number(v.timestamp);

  it('rechaza un cuerpo cambiado, otro secreto o una firma rota', () => {
    const base = { secrets: [v.secret], timestamp: v.timestamp, signature: v.signature, now };
    expect(verifyEvent({ ...base, body: v.body.replace('trapecio', 'lina') })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    expect(verifyEvent({ ...base, secrets: ['otro'], body: v.body })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    expect(verifyEvent({ ...base, signature: 'v0=abc', body: v.body })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyEvent({ ...base, signature: undefined, body: v.body })).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it(`acepta hasta ${EVENT_WINDOW_SECONDS} s de diferencia de reloj y rechaza más`, () => {
    const at = (delta: number) =>
      verifyEvent({
        secrets: [v.secret],
        timestamp: v.timestamp,
        signature: v.signature,
        body: v.body,
        now: now + delta,
      });
    expect(at(EVENT_WINDOW_SECONDS)).toEqual({ ok: true });
    expect(at(-EVENT_WINDOW_SECONDS)).toEqual({ ok: true });
    expect(at(EVENT_WINDOW_SECONDS + 1)).toEqual({ ok: false, reason: 'stale' });
  });

  it('durante una rotación vale cualquiera de los secretos', () => {
    expect(
      verifyEvent({
        secrets: ['secreto-nuevo', v.secret],
        timestamp: v.timestamp,
        signature: v.signature,
        body: v.body,
        now,
      }),
    ).toEqual({ ok: true });
  });
});
