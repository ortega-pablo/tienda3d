import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { EcommerceSettings } from '@prisma/client';
import type { EcommerceSettingsDto, EcommerceSettingsInput } from '@tienda3d/shared';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogEvents } from './catalog-events';

/** Fila única de ajustes. */
const SETTINGS_ID = 1;

/** Lo que vale mientras el admin no guardó nada (los defaults del schema). */
const DEFAULTS: EcommerceSettingsDto = {
  shippingFlatRate: null,
  freeShippingFrom: null,
  pickupEnabled: true,
  pickupInstructions: '',
  notificationEmail: '',
  updatedAt: null,
};

/**
 * Condiciones de venta de la tienda (plan F5·8): se cambian desde el sistema
 * sin tocar el sitio, que las lee por la vista `store_settings` (F10). Los
 * medios de pago van aparte (`WebPaymentsService`, F22·2).
 */
@Injectable()
export class WebSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: CatalogEvents,
  ) {}

  async get(): Promise<EcommerceSettingsDto> {
    const row = await this.prisma.ecommerceSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row ? toDto(row) : DEFAULTS;
  }

  async save(input: EcommerceSettingsInput, actorId: string): Promise<EcommerceSettingsDto> {
    const before = await this.get();
    if (!input.pickupEnabled) {
      const row = await this.prisma.ecommerceSettings.findUnique({ where: { id: SETTINGS_ID } });
      if (row?.cashEnabled) {
        throw new UnprocessableEntityException({
          message:
            'El efectivo es solo con retiro: apagalo en Medios de pago antes de apagar el retiro.',
          reason: 'CASH_NEEDS_PICKUP',
        });
      }
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.ecommerceSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, ...input },
        update: input,
      });
      await this.events.changed(tx, { scope: 'settings', ids: [] });
      return row;
    });

    await this.audit.record({
      actorId,
      entity: 'EcommerceSettings',
      entityId: String(SETTINGS_ID),
      action: 'update',
      before,
      after: input,
    });
    return toDto(saved);
  }
}

function toDto(s: EcommerceSettings): EcommerceSettingsDto {
  return {
    shippingFlatRate: s.shippingFlatRate === null ? null : Number(s.shippingFlatRate),
    freeShippingFrom: s.freeShippingFrom === null ? null : Number(s.freeShippingFrom),
    pickupEnabled: s.pickupEnabled,
    pickupInstructions: s.pickupInstructions,
    notificationEmail: s.notificationEmail,
    updatedAt: s.updatedAt.toISOString(),
  };
}
