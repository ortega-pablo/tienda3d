import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { EcommerceSettings } from '@prisma/client';
import type {
  EcommercePaymentsDto,
  EcommercePaymentsInput,
  OnlinePaymentMethod,
} from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { OutboxService } from '@/modules/outbox/outbox.service';
import { CatalogEvents } from './catalog-events';
import { StorefrontPaymentsClient, type PaymentsReadiness } from './storefront-payments.client';

const SETTINGS_ID = 1;

/** El switch de cada medio en línea. */
const ONLINE_SWITCH: Record<OnlinePaymentMethod, keyof EcommercePaymentsInput> = {
  MERCADOPAGO: 'mercadoPagoEnabled',
  MODO: 'modoEnabled',
  GOCUOTAS: 'goCuotasEnabled',
};

const METHOD_LABEL: Record<OnlinePaymentMethod, string> = {
  MERCADOPAGO: 'Mercado Pago',
  MODO: 'MODO',
  GOCUOTAS: 'Go Cuotas',
};

/** Los defaults del schema, mientras el admin no guardó nada. */
const DEFAULTS: Omit<EcommercePaymentsDto, 'readiness'> = {
  cashEnabled: false,
  bankTransferEnabled: false,
  bankTransferInstructions: '',
  mercadoPagoEnabled: true,
  modoEnabled: false,
  goCuotasEnabled: false,
  pickupEnabled: true,
  updatedAt: null,
};

/**
 * Medios de pago de la tienda (F22·2, D19): un switch por medio, con el permiso
 * `ecommerce:payments`. El sitio los lee por `store_settings` y, además, nunca
 * ofrece un medio en línea sin sus credenciales.
 */
@Injectable()
export class WebPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: CatalogEvents,
    private readonly storefront: StorefrontPaymentsClient,
    private readonly outbox: OutboxService,
  ) {}

  async get(): Promise<EcommercePaymentsDto> {
    const [row, readiness] = await Promise.all([this.row(), this.storefront.readiness()]);
    return { ...(row ? toDto(row) : DEFAULTS), readiness };
  }

  async save(input: EcommercePaymentsInput, actorId: string): Promise<EcommercePaymentsDto> {
    const row = await this.row();
    const before = row ? toDto(row) : DEFAULTS;
    if (input.cashEnabled && !before.pickupEnabled) {
      throw new UnprocessableEntityException({
        message: 'El efectivo es solo con retiro: prendé primero el retiro por el taller.',
        reason: 'CASH_NEEDS_PICKUP',
      });
    }

    // Solo se consulta al sitio si se prende un medio en línea que estaba apagado.
    const turnedOn = (Object.keys(ONLINE_SWITCH) as OnlinePaymentMethod[]).filter(
      (m) => input[ONLINE_SWITCH[m]] === true && before[ONLINE_SWITCH[m]] !== true,
    );
    let readiness: PaymentsReadiness | null = null;
    if (turnedOn.length) {
      readiness = await this.storefront.readiness();
      for (const method of turnedOn) {
        if (readiness[method] === 'ready') continue;
        throw new UnprocessableEntityException({
          message:
            readiness[method] === 'unknown'
              ? `No pudimos confirmar con la tienda que tenga las credenciales de ${METHOD_LABEL[method]}. Probá de nuevo en un momento.`
              : `La tienda no tiene las credenciales de ${METHOD_LABEL[method]}: no se puede prender.`,
          reason:
            readiness[method] === 'unknown' ? 'STOREFRONT_UNREACHABLE' : 'MISSING_CREDENTIALS',
          method,
        });
      }
    }

    // Datos para transferir nuevos (o la transferencia que se prende): la tienda
    // se entera por mail, contra el phishing de cuentas cambiadas (F22·3, A7).
    const bankChanged =
      input.bankTransferEnabled &&
      (!before.bankTransferEnabled ||
        input.bankTransferInstructions !== before.bankTransferInstructions);
    const actor = bankChanged
      ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
      : null;

    const saved = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ecommerceSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, ...input },
        update: input,
      });
      await this.events.changed(tx, { scope: 'settings', ids: [] });
      if (bankChanged) {
        await this.outbox.enqueue(tx, 'store.bank_details_changed', {
          changedAt: updated.updatedAt.toISOString(),
          changedBy: actor?.name ?? 'un usuario del panel',
        });
      }
      return updated;
    });

    const { updatedAt: _b, pickupEnabled: _p, ...beforeFields } = before;
    await this.audit.record({
      actorId,
      entity: 'EcommercePayments',
      entityId: String(SETTINGS_ID),
      action: 'update',
      before: beforeFields,
      after: input,
    });
    return { ...toDto(saved), readiness: readiness ?? (await this.storefront.readiness()) };
  }

  private row() {
    return this.prisma.ecommerceSettings.findUnique({ where: { id: SETTINGS_ID } });
  }
}

function toDto(s: EcommerceSettings): Omit<EcommercePaymentsDto, 'readiness'> {
  return {
    cashEnabled: s.cashEnabled,
    bankTransferEnabled: s.bankTransferEnabled,
    bankTransferInstructions: s.bankTransferInstructions,
    mercadoPagoEnabled: s.mercadoPagoEnabled,
    modoEnabled: s.modoEnabled,
    goCuotasEnabled: s.goCuotasEnabled,
    pickupEnabled: s.pickupEnabled,
    updatedAt: s.updatedAt.toISOString(),
  };
}
