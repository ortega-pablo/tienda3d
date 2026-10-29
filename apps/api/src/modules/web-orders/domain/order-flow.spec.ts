import {
  allowedFulfillments,
  canConfirmTransfer,
  canMoveFulfillment,
  needsAttention,
  type OrderState,
} from './order-flow';

describe('Pedidos web: qué puede hacer el admin (§5.6)', () => {
  const pickup: OrderState = {
    paymentMethod: 'BANK_TRANSFER',
    paymentStatus: 'APPROVED',
    fulfillmentStatus: 'RECEIVED',
    deliveryMethod: 'PICKUP',
  };
  const shipping: OrderState = { ...pickup, deliveryMethod: 'SHIPPING' };

  it('preparar exige el pago aprobado; cancelar, no', () => {
    expect(allowedFulfillments(pickup)).toEqual(['PREPARING', 'CANCELLED']);
    expect(allowedFulfillments({ ...pickup, paymentStatus: 'AWAITING_TRANSFER' })).toEqual([
      'CANCELLED',
    ]);
    expect(allowedFulfillments({ ...pickup, paymentStatus: 'PENDING' })).toEqual(['CANCELLED']);
  });

  it('el retiro pasa a listo para retirar; el envío, a enviado', () => {
    expect(allowedFulfillments({ ...pickup, fulfillmentStatus: 'PREPARING' })).toEqual([
      'READY_FOR_PICKUP',
      'CANCELLED',
    ]);
    expect(allowedFulfillments({ ...shipping, fulfillmentStatus: 'PREPARING' })).toEqual([
      'SHIPPED',
      'CANCELLED',
    ]);
  });

  it('lo enviado ya no se cancela, y lo entregado o cancelado no cambia más', () => {
    expect(allowedFulfillments({ ...shipping, fulfillmentStatus: 'SHIPPED' })).toEqual([
      'DELIVERED',
      'PREPARING',
    ]);
    expect(allowedFulfillments({ ...pickup, fulfillmentStatus: 'DELIVERED' })).toEqual([]);
    expect(allowedFulfillments({ ...pickup, fulfillmentStatus: 'CANCELLED' })).toEqual([]);
  });

  it('no se saltea la preparación', () => {
    expect(canMoveFulfillment(pickup, 'READY_FOR_PICKUP')).toBe(false);
    expect(canMoveFulfillment(pickup, 'DELIVERED')).toBe(false);
    expect(
      canMoveFulfillment({ ...pickup, fulfillmentStatus: 'READY_FOR_PICKUP' }, 'DELIVERED'),
    ).toBe(true);
  });

  it('la transferencia se confirma solo si se la está esperando', () => {
    const waiting = { ...pickup, paymentStatus: 'AWAITING_TRANSFER' } as const;
    expect(canConfirmTransfer(waiting)).toBe(true);
    expect(canConfirmTransfer(pickup)).toBe(false);
    expect(canConfirmTransfer({ ...waiting, fulfillmentStatus: 'CANCELLED' })).toBe(false);
    expect(
      canConfirmTransfer({ ...waiting, paymentMethod: 'MERCADOPAGO', paymentStatus: 'PENDING' }),
    ).toBe(false);
  });

  it('esperan al taller: la transferencia a confirmar y lo pagado sin empezar', () => {
    expect(
      needsAttention({ paymentStatus: 'AWAITING_TRANSFER', fulfillmentStatus: 'RECEIVED' }),
    ).toBe(true);
    expect(needsAttention({ paymentStatus: 'APPROVED', fulfillmentStatus: 'RECEIVED' })).toBe(true);
    expect(needsAttention({ paymentStatus: 'PENDING', fulfillmentStatus: 'RECEIVED' })).toBe(false);
    expect(needsAttention({ paymentStatus: 'APPROVED', fulfillmentStatus: 'PREPARING' })).toBe(
      false,
    );
  });
});
