import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ecommerceSettingsSchema,
  webAttributesSchema,
  webCategoryCreateSchema,
  webCategoryUpdateSchema,
  webImageUpdateSchema,
  webColorOptionsSchema,
  webProductCreateSchema,
  webProductCategoriesSchema,
  webProductMembersSchema,
  webProductUpdateSchema,
  webVariantUpdateSchema,
  type EcommerceSettingsInput,
  type WebAttributesInput,
  type WebCategoryCreateInput,
  type WebCategoryUpdateInput,
  type WebImageUpdateInput,
  type WebColorOptionsInput,
  type WebProductCreateInput,
  type WebProductCategoriesInput,
  type WebProductMembersInput,
  type WebProductUpdateInput,
  type WebVariantUpdateInput,
} from '@tienda3d/shared';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { IMAGE_UPLOAD } from '@/common/storage/images';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { WebAttributesService } from './web-attributes.service';
import { WebCategoriesService } from './web-categories.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebImagesService } from './web-images.service';
import { WebProductsService } from './web-products.service';
import { WebPublicationService } from './web-publication.service';
import { WebSettingsService } from './web-settings.service';
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
    private readonly categories: WebCategoriesService,
    private readonly publication: WebPublicationService,
    private readonly settings: WebSettingsService,
    private readonly images: WebImagesService,
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

  @Permissions('ecommerce:write')
  @Put('products/:id/categories')
  setProductCategories(
    @Param('id') id: string,
    @Body(ZodValidation(webProductCategoriesSchema)) body: WebProductCategoriesInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.categories.setProductCategories(id, body.categoryIds, user.sub);
  }

  @Permissions('ecommerce:read')
  @Get('categories')
  listCategories() {
    return this.categories.list();
  }

  @Permissions('ecommerce:write')
  @Post('categories')
  createCategory(
    @Body(ZodValidation(webCategoryCreateSchema)) body: WebCategoryCreateInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.categories.create(body, user.sub);
  }

  @Permissions('ecommerce:write')
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body(ZodValidation(webCategoryUpdateSchema)) body: WebCategoryUpdateInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.categories.update(id, body, user.sub);
  }

  @Permissions('ecommerce:write')
  @Delete('categories/:id')
  @HttpCode(204)
  removeCategory(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    return this.categories.remove(id, user.sub);
  }

  @Permissions('ecommerce:read')
  @Get('products/:id/checklist')
  checklist(@Param('id') id: string) {
    return this.publication.checklist(id);
  }

  @Permissions('ecommerce:write')
  @Post('products/:id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    return this.publication.publish(id, user.sub);
  }

  @Permissions('ecommerce:write')
  @Post('products/:id/hide')
  @HttpCode(200)
  hide(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    return this.publication.hide(id, user.sub);
  }

  @Permissions('ecommerce:settings')
  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Permissions('ecommerce:settings')
  @Put('settings')
  saveSettings(
    @Body(ZodValidation(ecommerceSettingsSchema)) body: EcommerceSettingsInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.settings.save(body, user.sub);
  }

  /** Multipart en memoria (sin `dest`): el archivo se procesa antes de tocar el disco. */
  @Permissions('ecommerce:write')
  @Post('products/:id/images')
  @UseInterceptors(
    FilesInterceptor('files', IMAGE_UPLOAD.maxFiles, {
      limits: { fileSize: IMAGE_UPLOAD.maxBytes, files: IMAGE_UPLOAD.maxFiles },
    }),
  )
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.images.upload(id, files ?? [], user.sub);
  }

  @Permissions('ecommerce:write')
  @Patch('products/:id/images/:imageId')
  updateImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body(ZodValidation(webImageUpdateSchema)) body: WebImageUpdateInput,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.images.update(id, imageId, body, user.sub);
  }

  @Permissions('ecommerce:write')
  @Delete('products/:id/images/:imageId')
  removeImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.images.remove(id, imageId, user.sub);
  }

  @Permissions('ecommerce:write')
  @Post('categories/:id/image')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: IMAGE_UPLOAD.maxBytes, files: 1 } }),
  )
  setCategoryImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.categories.setImage(id, file, user.sub);
  }

  @Permissions('ecommerce:write')
  @Delete('categories/:id/image')
  removeCategoryImage(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    return this.categories.removeImage(id, user.sub);
  }
}
