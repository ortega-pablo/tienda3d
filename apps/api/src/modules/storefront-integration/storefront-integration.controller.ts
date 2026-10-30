import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
  QUOTE_ATTACHMENT,
  StorefrontQuoteRequestsService,
  webQuoteRequestSchema,
  type ReceivedFile,
} from './storefront-quote-requests.service';
import {
  StorefrontOrdersService,
  webOrderSchema,
  type WebOrderInput,
} from './storefront-orders.service';
import { StorefrontB2bCatalogService } from './storefront-b2b-catalog.service';
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
    private readonly b2bCatalog: StorefrontB2bCatalogService,
    private readonly webCustomers: WebCustomersService,
    private readonly orders: StorefrontOrdersService,
    private readonly orderEvents: StorefrontOrderEventsService,
    private readonly quoteRequests: StorefrontQuoteRequestsService,
  ) {}

  /** Health de la integración: la clave sirve y la API responde. */
  @IntegrationScopes('ping')
  @Get('ping')
  ping(@Req() req: Request & { integrationClient: IntegrationClientRef }) {
    return { ok: true, client: req.integrationClient.name, time: new Date().toISOString() };
  }

  /**
   * El catálogo de un cliente B2B (F21·1, D18): `externalId` es la cuenta del
   * sitio. Sin márgenes. 404 si la cuenta no tiene catálogo.
   */
  @IntegrationScopes('b2b:read')
  @Get('customers/:externalId/catalog')
  b2bCatalogJson(@Param('externalId') externalId: string) {
    return this.b2bCatalog.forAccount(externalId);
  }

  /** El mismo catálogo en PDF, sin las columnas internas. */
  @IntegrationScopes('b2b:read')
  @Get('customers/:externalId/catalog.pdf')
  async b2bCatalogPdf(@Param('externalId') externalId: string, @Res() res: Response) {
    const { buffer, filename } = await this.b2bCatalog.pdfForAccount(externalId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
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

  /**
   * Una solicitud de personalización (F15·2), multipart: `data` (JSON) y el
   * archivo opcional en `attachment`. Idempotente por `externalId`.
   */
  @IntegrationScopes('quote-requests:write')
  @Post('quote-requests')
  @UseInterceptors(
    FileInterceptor('attachment', { limits: { fileSize: QUOTE_ATTACHMENT.maxBytes, files: 1 } }),
  )
  receiveQuoteRequest(
    @Body('data') data: string | undefined,
    @UploadedFile() file: ReceivedFile | undefined,
  ) {
    let json: unknown;
    try {
      json = JSON.parse(data ?? '');
    } catch {
      throw new BadRequestException('Falta el campo data (JSON)');
    }
    const parsed = webQuoteRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Solicitud inválida', issues: parsed.error.issues });
    }
    return this.quoteRequests.receive(parsed.data, file ?? null);
  }
}
