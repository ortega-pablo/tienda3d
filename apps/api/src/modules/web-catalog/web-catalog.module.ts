import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CatalogEvents, OutboxCatalogEvents } from './catalog-events';
import { WebCatalogController } from './web-catalog.controller';
import { WebAttributesService } from './web-attributes.service';
import { WebCategoriesService } from './web-categories.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebImagesService } from './web-images.service';
import { WebMediaController } from './web-media.controller';
import { RECALC_TIMER, realTimer, WebPriceRecalcService } from './web-price-recalc.service';
import { WebPriceService } from './web-price.service';
import { WebProductsService } from './web-products.service';
import { WebPublicationService } from './web-publication.service';
import { WebSettingsService } from './web-settings.service';
import { WebVariantsService } from './web-variants.service';

/** Tienda online: catálogo web gestionado desde el sistema (plan de unificación, F5). */
@Module({
  imports: [PricingModule, OutboxModule],
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
    WebPriceService,
    WebPriceRecalcService,
    { provide: RECALC_TIMER, useValue: realTimer },
    { provide: CatalogEvents, useClass: OutboxCatalogEvents },
  ],
  exports: [WebProductsService, CatalogEvents],
})
export class WebCatalogModule {}
