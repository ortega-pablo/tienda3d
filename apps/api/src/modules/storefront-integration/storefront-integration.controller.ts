import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
  constructor(private readonly webCustomers: WebCustomersService) {}

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
}
