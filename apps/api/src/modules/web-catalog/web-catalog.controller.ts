import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  webAttributesSchema,
  webColorOptionsSchema,
  webProductCreateSchema,
  webProductMembersSchema,
  webProductUpdateSchema,
  webVariantUpdateSchema,
  type WebAttributesInput,
  type WebColorOptionsInput,
  type WebProductCreateInput,
  type WebProductMembersInput,
  type WebProductUpdateInput,
  type WebVariantUpdateInput,
} from '@tienda3d/shared';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { WebAttributesService } from './web-attributes.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebProductsService } from './web-products.service';
import { WebVariantsService } from './web-variants.service';

/** Gestión de la tienda online. Solo el rol admin tiene ecommerce:* (F4·1). */
@UseGuards(PermissionsGuard)
@Controller('web-catalog')
export class WebCatalogController {
  constructor(
    private readonly products: WebProductsService,
    private readonly colorOptions: WebColorOptionsService,
    private readonly attributes: WebAttributesService,
    private readonly variants: WebVariantsService,
  ) {}

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

  @Permissions('ecommerce:write')
  @Put('products/:id/color-options')
  setColorOptions(
    @Param('id') id: string,
    @Body(ZodValidation(webColorOptionsSchema)) body: WebColorOptionsInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.colorOptions.set(id, body.options, user.sub);
  }

  @Permissions('ecommerce:write')
  @Put('products/:id/attributes')
  setAttributes(
    @Param('id') id: string,
    @Body(ZodValidation(webAttributesSchema)) body: WebAttributesInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.attributes.set(id, body.attributes, user.sub);
  }

  @Permissions('ecommerce:write')
  @Post('products/:id/variants/regenerate')
  regenerateVariants(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    return this.variants.regenerate(id, user.sub);
  }

  @Permissions('ecommerce:write')
  @Patch('variants/:id')
  updateVariant(
    @Param('id') id: string,
    @Body(ZodValidation(webVariantUpdateSchema)) body: WebVariantUpdateInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.variants.update(id, body, user.sub);
  }
}
