import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '@/common/decorators/public.decorator';
import {
  IntegrationAuthGuard,
  type IntegrationClientRef,
} from '@/common/integration-auth/integration-auth.guard';
import { IntegrationScopes } from '@/common/integration-auth/integration-scopes.decorator';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import {
  StorefrontOrderEventsService,
  webOrderEventSchema,
  type WebOrderEventInput,
} from './storefront-order-events.service';
import {
  StorefrontOrdersService,
  webOrderSchema,
  type WebOrderInput,
} from './storefront-orders.service';
import {
  webCustomerSchema,
  WebCustomersService,
  type WebCustomerInput,
} from './web-customers.service';

/**
 * API de integración del sitio (plan F11, §5.5). No usa la sesión de usuario
 * (`@Public` para el JWT): la protege su propio guard con la clave del sitio, y
 * solo se llega por la red interna (el panel y Caddy devuelven 404).
 */
@Public()
@UseGuards(IntegrationAuthGuard)
// Cupo propio: el sitio llama por todos sus clientes desde una sola IP.
@Throttle({ default: { limit: 600, ttl: 60_000 } })
@Controller('integrations/storefront/v1')
export class StorefrontIntegrationController {
  constructor(
    private readonly webCustomers: WebCustomersService,
    private readonly orders: StorefrontOrdersService,
    private readonly orderEvents: StorefrontOrderEventsService,
  ) {}

  /** Health de la integración: la clave sirve y la API responde. */
  @IntegrationScopes('ping')
  @Get('ping')
  ping(@Req() req: Request & { integrationClient: IntegrationClientRef }) {
    return { ok: true, client: req.integrationClient.name, time: new Date().toISOString() };
  }

  /** Una cuenta del sitio en Clientes del sistema (F13·8). */
  @IntegrationScopes('customers:write')
  @Post('customers')
  async upsertCustomer(
    @Body(ZodValidation(webCustomerSchema)) body: WebCustomerInput,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) throw new BadRequestException('Falta Idempotency-Key');
    const { result, replayed } = await this.webCustomers.upsert(body, idempotencyKey);
    return { ...result, replayed };
  }

  /**
   * Un pedido del sitio (F14·3): valida precio y stock, reserva y devuelve el
   * código. Idempotente por `externalId`. 409 si cambió un precio o no alcanza
   * el stock, 422 si algo ya no está a la venta (el motivo va en `details`).
   */
  @IntegrationScopes('orders:write')
  @Post('orders')
  placeOrder(@Body(ZodValidation(webOrderSchema)) body: WebOrderInput) {
    return this.orders.place(body);
  }

  /**
   * Un cambio de un pedido en el sitio (F14·6): por ahora, cómo va el pago, que
   * maneja el sitio. Idempotente por Idempotency-Key; uno más viejo que el
   * último aplicado se ignora.
   */
  @IntegrationScopes('orders:events')
  @Post('orders/:externalId/events')
  orderEvent(
    @Param('externalId') externalId: string,
    @Body(ZodValidation(webOrderEventSchema)) body: WebOrderEventInput,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) throw new BadRequestException('Falta Idempotency-Key');
    return this.orderEvents.apply(externalId, body, idempotencyKey);
  }
}
