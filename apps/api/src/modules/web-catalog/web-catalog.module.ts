import { Module } from '@nestjs/common';
import { CatalogEvents, NoopCatalogEvents } from './catalog-events';
import { WebCatalogController } from './web-catalog.controller';
import { WebAttributesService } from './web-attributes.service';
import { WebCategoriesService } from './web-categories.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebImagesService } from './web-images.service';
import { WebMediaController } from './web-media.controller';
import { WebProductsService } from './web-products.service';
import { WebPublicationService } from './web-publication.service';
import { WebSettingsService } from './web-settings.service';
import { WebVariantsService } from './web-variants.service';

/** Tienda online: catálogo web gestionado desde el sistema (plan de unificación, F5). */
@Module({
  controllers: [WebCatalogController, WebMediaController],
  providers: [
    WebProductsService,
    WebColorOptionsService,
    WebAttributesService,
    WebVariantsService,
    WebCategoriesService,
    WebPublicationService,
    WebSettingsService,
    WebImagesService,
    // El outbox real llega con F11·3.
    { provide: CatalogEvents, useClass: NoopCatalogEvents },
  ],
  exports: [WebProductsService],
})
export class WebCatalogModule {}
