import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  webOrderCancelSchema,
  webOrderCashConfirmSchema,
  webOrderFulfillmentChangeSchema,
  webOrderListQuerySchema,
  webOrderNotesSchema,
  webOrderProductionSchema,
  webOrderRefundSchema,
  webOrderTransferConfirmSchema,
  type WebOrderAttentionDto,
  type WebOrderCancelInput,
  type WebOrderCashConfirmInput,
  type WebOrderFulfillmentChangeInput,
  type WebOrderListQuery,
  type WebOrderNotesInput,
  type WebOrderProductionInput,
  type WebOrderRefundInput,
  type WebOrderTransferConfirmInput,
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

  /** Transferencia acreditada (F22·3): pide el permiso de pagos, no el de pedidos. */
  @Permissions('ecommerce:payments')
  @Post(':id/confirm-transfer')
  confirmTransfer(
    @Param('id') id: string,
    @Body(ZodValidation(webOrderTransferConfirmSchema)) body: WebOrderTransferConfirmInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.orders.confirmTransfer(id, body, user.sub);
  }

  /** 48 h más para pagar (F22·4): con el permiso de pagos. */
  @Permissions('ecommerce:payments')
  @Post(':id/extend-payment')
  extendPayment(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    return this.orders.extendPayment(id, user.sub);
  }

  /** Cobro en efectivo al retirar (F22·3). */
  @Permissions('ecommerce:payments')
  @Post(':id/confirm-cash')
  confirmCash(
    @Param('id') id: string,
    @Body(ZodValidation(webOrderCashConfirmSchema)) body: WebOrderCashConfirmInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.orders.confirmCash(id, body, user.sub);
  }

  /** Reembolso total o parcial (F22·5): el sitio se lo pide al proveedor. */
  @Permissions('ecommerce:payments')
  @Post(':id/refund')
  refund(
    @Param('id') id: string,
    @Body(ZodValidation(webOrderRefundSchema)) body: WebOrderRefundInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.orders.refund(id, body, user.sub);
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
