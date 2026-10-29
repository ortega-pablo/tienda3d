import { Injectable } from '@nestjs/common';
import { CustomerSource, CustomerType, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { InboundEventsService } from '@/modules/inbound-events/inbound-events.service';

/** Lo que el sitio manda de una cuenta (F13·8): solo datos de contacto. */
export const webCustomerSchema = z.object({
  externalId: z.string().min(1).max(64),
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40),
  documentNumber: z.string().trim().max(20).nullable(),
});
export type WebCustomerInput = z.infer<typeof webCustomerSchema>;

export interface WebCustomerResult {
  customerId: string;
  /** Es un cliente del sistema que ya existía con ese email (D4). */
  linked: boolean;
  [key: string]: string | boolean;
}

/**
 * Clientes de la tienda online en Clientes del sistema (plan F13·8, D4). Si el
 * email ya es de un cliente, lo vincula sin tocar su tipo ni su nombre; si no,
 * lo crea como STANDARD de origen web. Una misma llamada repetida (por
 * Idempotency-Key) no repite el efecto (F11·4).
 */
@Injectable()
export class WebCustomersService {
  constructor(private readonly inbound: InboundEventsService) {}

  async upsert(input: WebCustomerInput, idempotencyKey: string) {
    return this.inbound.once<WebCustomerResult>('storefront:customers', idempotencyKey, (tx) =>
      this.apply(tx, input),
    );
  }

  /** Lo mismo, dentro de otra transacción (el pedido trae los datos de su cliente, F14·3). */
  async apply(tx: Prisma.TransactionClient, input: WebCustomerInput): Promise<WebCustomerResult> {
    const name = `${input.firstName} ${input.lastName}`.trim();
    const sameEmail = (excludeId?: string) =>
      tx.customer.findFirst({
        where: {
          email: { equals: input.email, mode: 'insensitive' },
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      });

    const known = await tx.customer.findUnique({ where: { externalId: input.externalId } });
    if (known) {
      // Un cliente creado por la web sigue los datos de la cuenta; uno del sistema
      // vinculado conserva los suyos y solo completa lo que le falta.
      const fromWeb = known.source === CustomerSource.WEB;
      const emailFree = !(await sameEmail(known.id));
      await tx.customer.update({
        where: { id: known.id },
        data: fromWeb
          ? {
              name,
              phone: input.phone || null,
              taxId: input.documentNumber,
              ...(emailFree ? { email: input.email } : {}),
            }
          : {
              phone: known.phone ?? (input.phone || null),
              taxId: known.taxId ?? input.documentNumber,
            },
      });
      return { customerId: known.id, linked: !fromWeb };
    }

    const existing = await sameEmail();
    if (existing) {
      await tx.customer.update({
        where: { id: existing.id },
        data: {
          externalId: input.externalId,
          phone: existing.phone ?? (input.phone || null),
          taxId: existing.taxId ?? input.documentNumber,
        },
      });
      return { customerId: existing.id, linked: true };
    }

    const created = await tx.customer.create({
      data: {
        name,
        type: CustomerType.STANDARD,
        source: CustomerSource.WEB,
        externalId: input.externalId,
        email: input.email,
        phone: input.phone || null,
        taxId: input.documentNumber,
      },
    });
    return { customerId: created.id, linked: false };
  }
}
