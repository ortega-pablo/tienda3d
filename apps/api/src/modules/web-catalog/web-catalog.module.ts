import { Module } from '@nestjs/common';
import { WebCatalogController } from './web-catalog.controller';
import { WebAttributesService } from './web-attributes.service';
import { WebCategoriesService } from './web-categories.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebProductsService } from './web-products.service';
import { WebVariantsService } from './web-variants.service';

/** Tienda online: catálogo web gestionado desde el sistema (plan de unificación, F5). */
@Module({
  controllers: [WebCatalogController],
  providers: [
    WebProductsService,
    WebColorOptionsService,
    WebAttributesService,
    WebVariantsService,
    WebCategoriesService,
  ],
  exports: [WebProductsService],
})
export class WebCatalogModule {}
