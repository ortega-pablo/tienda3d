import { Module } from '@nestjs/common';
import { WebCatalogController } from './web-catalog.controller';
import { WebProductsService } from './web-products.service';

/** Tienda online: catálogo web gestionado desde el sistema (plan de unificación, F5). */
@Module({
  controllers: [WebCatalogController],
  providers: [WebProductsService],
  exports: [WebProductsService],
})
export class WebCatalogModule {}
