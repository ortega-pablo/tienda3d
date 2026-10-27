import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  webProductCreateSchema,
  webProductMembersSchema,
  webProductUpdateSchema,
  type WebProductCreateInput,
  type WebProductMembersInput,
  type WebProductUpdateInput,
} from '@tienda3d/shared';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { WebProductsService } from './web-products.service';

/** Gestión de la tienda online. Solo el rol admin tiene ecommerce:* (F4·1). */
@UseGuards(PermissionsGuard)
@Controller('web-catalog')
export class WebCatalogController {
  constructor(private readonly products: WebProductsService) {}

  @Permissions('ecommerce:read')
  @Get('products')
  list() {
    return this.products.list();
  }

  @Permissions('ecommerce:read')
  @Get('products/:id')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Permissions('ecommerce:write')
  @Post('products')
  create(
    @Body(ZodValidation(webProductCreateSchema)) body: WebProductCreateInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.products.create(body, user.sub);
  }

  @Permissions('ecommerce:write')
  @Patch('products/:id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(webProductUpdateSchema)) body: WebProductUpdateInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.products.update(id, body, user.sub);
  }

  @Permissions('ecommerce:write')
  @Put('products/:id/members')
  setMembers(
    @Param('id') id: string,
    @Body(ZodValidation(webProductMembersSchema)) body: WebProductMembersInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.products.setMembers(id, body.members, user.sub);
  }
}
