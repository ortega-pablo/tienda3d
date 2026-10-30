import {
  allowedFulfillments,
  canConfirmCash,
  canConfirmTransfer,
  canStartProduction,
  canMoveFulfillment,
  initialPayment,
  needsAttention,
  paymentStartIssue,
  productionColors,
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

describe('Orden de producción de un ítem (F14·7)', () => {
  it('se fabrica lo pagado que no salió del taller', () => {
    expect(canStartProduction({ paymentStatus: 'APPROVED', fulfillmentStatus: 'RECEIVED' })).toBe(
      true,
    );
    expect(canStartProduction({ paymentStatus: 'APPROVED', fulfillmentStatus: 'PREPARING' })).toBe(
      true,
    );
    expect(
      canStartProduction({ paymentStatus: 'AWAITING_TRANSFER', fulfillmentStatus: 'RECEIVED' }),
    ).toBe(false);
    expect(canStartProduction({ paymentStatus: 'APPROVED', fulfillmentStatus: 'CANCELLED' })).toBe(
      false,
    );
    expect(canStartProduction({ paymentStatus: 'APPROVED', fulfillmentStatus: 'SHIPPED' })).toBe(
      false,
    );
  });

  it('cada pieza toma el color de la opción que la pinta, solo las del producto', () => {
    const pieces = [
      { id: 'pantalla', needsColor: true },
      { id: 'cuerpo', needsColor: true },
      { id: 'tornillo', needsColor: false },
    ];
    expect(
      productionColors(pieces, [
        // La opción también pinta piezas de otro tamaño: se ignoran.
        { materialId: 'marron', pieceIds: ['pantalla', 'cuerpo', 'pantalla-390'] },
      ]),
    ).toEqual({ overrides: { pantalla: 'marron', cuerpo: 'marron' }, missing: [] });
  });

  it('dos opciones de color pintan cada una sus piezas; lo que nadie cubre falta', () => {
    const pieces = [
      { id: 'pantalla', needsColor: true },
      { id: 'base', needsColor: true },
      { id: 'cable', needsColor: true },
    ];
    expect(
      productionColors(pieces, [
        { materialId: 'blanco', pieceIds: ['pantalla'] },
        { materialId: 'negro', pieceIds: ['base'] },
      ]),
    ).toEqual({ overrides: { pantalla: 'blanco', base: 'negro' }, missing: ['cable'] });
  });
});

describe('Pedidos web: cómo empieza el pago de cada medio (F22·2)', () => {
  it('la transferencia y el efectivo esperan al admin; los medios en línea, al proveedor', () => {
    expect(initialPayment('BANK_TRANSFER')).toBe('AWAITING_TRANSFER');
    expect(initialPayment('CASH')).toBe('AWAITING_CASH');
    for (const method of ['MERCADOPAGO', 'MODO', 'GOCUOTAS'] as const)
      expect(initialPayment(method)).toBe('PENDING');
  });

  it('el efectivo es solo con retiro, y el estado tiene que ser el del medio', () => {
    const cash = {
      paymentMethod: 'CASH',
      paymentStatus: 'AWAITING_CASH',
      deliveryMethod: 'PICKUP',
    } as const;
    expect(paymentStartIssue(cash)).toBeNull();
    expect(paymentStartIssue({ ...cash, deliveryMethod: 'SHIPPING' })).toMatch(/solo con retiro/);
    expect(paymentStartIssue({ ...cash, paymentStatus: 'APPROVED' })).toMatch(/no corresponde/);
    expect(
      paymentStartIssue({
        paymentMethod: 'MODO',
        paymentStatus: 'PENDING',
        deliveryMethod: 'SHIPPING',
      }),
    ).toBeNull();
  });
});

describe('Pedidos web: el cobro en efectivo (F22·3)', () => {
  const cash: OrderState = {
    paymentMethod: 'CASH',
    paymentStatus: 'AWAITING_CASH',
    fulfillmentStatus: 'RECEIVED',
    deliveryMethod: 'PICKUP',
  };
  it('se cobra un pedido en efectivo con retiro que espera el pago', () => {
    expect(canConfirmCash(cash)).toBe(true);
    expect(canConfirmTransfer(cash)).toBe(false);
  });
  it('no se cobra pagado, cancelado, con envío ni de otro medio', () => {
    expect(canConfirmCash({ ...cash, paymentStatus: 'APPROVED' })).toBe(false);
    expect(canConfirmCash({ ...cash, fulfillmentStatus: 'CANCELLED' })).toBe(false);
    expect(canConfirmCash({ ...cash, deliveryMethod: 'SHIPPING' })).toBe(false);
    expect(
      canConfirmCash({
        ...cash,
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'AWAITING_TRANSFER',
      }),
    ).toBe(false);
  });
});
