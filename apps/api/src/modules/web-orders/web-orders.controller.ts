import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  webOrderCancelSchema,
  webOrderFulfillmentChangeSchema,
  webOrderListQuerySchema,
  webOrderNotesSchema,
  webOrderProductionSchema,
  type WebOrderAttentionDto,
  type WebOrderCancelInput,
  type WebOrderFulfillmentChangeInput,
  type WebOrderListQuery,
  type WebOrderNotesInput,
  type WebOrderProductionInput,
} from '@tienda3d/shared';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { WebOrdersService } from './web-orders.service';

/** Pedidos web en el panel (F14·5). Tienen datos del cliente: solo `ecommerce:orders`. */
@UseGuards(PermissionsGuard)
@Controller('web-orders')
export class WebOrdersController {
  constructor(private readonly orders: WebOrdersService) {}

  @Permissions('ecommerce:orders')
  @Get()
  list(@Query(ZodValidation(webOrderListQuerySchema)) query: WebOrderListQuery) {
    return this.orders.list(query);
  }

  @Permissions('ecommerce:orders')
  @Get('attention')
  async attention(): Promise<WebOrderAttentionDto> {
    return { count: await this.orders.attentionCount() };
  }

  @Permissions('ecommerce:orders')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Permissions('ecommerce:orders')
  @Post(':id/confirm-transfer')
  confirmTransfer(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    return this.orders.confirmTransfer(id, user.sub);
  }

  @Permissions('ecommerce:orders')
  @Post(':id/fulfillment')
  changeFulfillment(
    @Param('id') id: string,
    @Body(ZodValidation(webOrderFulfillmentChangeSchema)) body: WebOrderFulfillmentChangeInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.orders.changeFulfillment(id, body, user.sub);
  }

  @Permissions('ecommerce:orders')
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body(ZodValidation(webOrderCancelSchema)) body: WebOrderCancelInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.orders.cancel(id, body, user.sub);
  }

  @Permissions('ecommerce:orders')
  @Patch(':id/notes')
  updateNotes(
    @Param('id') id: string,
    @Body(ZodValidation(webOrderNotesSchema)) body: WebOrderNotesInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.orders.updateNotes(id, body.internalNotes, user.sub);
  }

  /** Lo que se va a fabricar para un ítem, para mostrarlo antes de generar la orden (F14·7). */
  @Permissions('ecommerce:orders', 'production:read')
  @Get(':id/items/:itemId/production-plan')
  productionPlan(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.orders.productionPlan(id, itemId);
  }

  @Permissions('ecommerce:orders', 'production:execute')
  @Post(':id/items/:itemId/production-order')
  createProductionOrder(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(ZodValidation(webOrderProductionSchema)) body: WebOrderProductionInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.orders.createProductionOrder(id, itemId, body.quantity, user.sub);
  }
}
