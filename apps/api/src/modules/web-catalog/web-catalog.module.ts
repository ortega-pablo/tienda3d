import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PricingModule } from '../pricing/pricing.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CatalogEvents, OutboxCatalogEvents } from './catalog-events';
import {
  STOREFRONT_PAYMENTS_TARGET,
  StorefrontPaymentsClient,
  type StorefrontPaymentsTarget,
} from './storefront-payments.client';
import { WebCatalogController } from './web-catalog.controller';
import { WebAttributesService } from './web-attributes.service';
import { WebCategoriesService } from './web-categories.service';
import { WebColorOptionsService } from './web-color-options.service';
import { WebImagesService } from './web-images.service';
import { WebMediaController } from './web-media.controller';
import { RECALC_TIMER, realTimer, WebPriceRecalcService } from './web-price-recalc.service';
import { WebPriceService } from './web-price.service';
import { WebProductsService } from './web-products.service';
import { WebPaymentsService } from './web-payments.service';
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
    WebPaymentsService,
    StorefrontPaymentsClient,
    {
      provide: STOREFRONT_PAYMENTS_TARGET,
      inject: [ConfigService],
      // El sitio responde en su API interna, al lado de los avisos (F22·2).
      useFactory: (config: ConfigService): StorefrontPaymentsTarget => ({
        url: new URL(
          '/api/internal/payments/',
          config.getOrThrow<string>('STOREFRONT_EVENTS_URL'),
        ).toString(),
        secret: config.get<string>('EVENTS_SECRET_T3D_TO_SF') || undefined,
      }),
    },
    WebImagesService,
    WebPriceService,
    WebPriceRecalcService,
    { provide: RECALC_TIMER, useValue: realTimer },
    { provide: CatalogEvents, useClass: OutboxCatalogEvents },
  ],
  exports: [WebProductsService, CatalogEvents],
})
export class WebCatalogModule {}
