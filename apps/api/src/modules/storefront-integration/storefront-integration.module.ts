import { CustomersModule } from '@/modules/customers/customers.module';
import { QuotesModule } from '@/modules/quotes/quotes.module';
import { StorefrontB2bCatalogService } from './storefront-b2b-catalog.service';
import { StorefrontB2bOrdersService } from './storefront-b2b-orders.service';
import { Module } from '@nestjs/common';
import { WebCatalogModule } from '@/modules/web-catalog/web-catalog.module';
import { WebOrdersModule } from '@/modules/web-orders/web-orders.module';
import { IntegrationAuthGuard } from '@/common/integration-auth/integration-auth.guard';
import { StorefrontIntegrationController } from './storefront-integration.controller';
import { StorefrontOrderEventsService } from './storefront-order-events.service';
import { StorefrontOrdersService } from './storefront-orders.service';
import { StorefrontQuoteRequestsService } from './storefront-quote-requests.service';
import { WebCustomersService } from './web-customers.service';

/** Lo que el sitio le pide al sistema: pedidos, clientes, solicitudes (plan F11–F15). */
@Module({
  imports: [WebCatalogModule, WebOrdersModule, CustomersModule, QuotesModule],
  controllers: [StorefrontIntegrationController],
  providers: [
    IntegrationAuthGuard,
    WebCustomersService,
    StorefrontOrdersService,
    StorefrontOrderEventsService,
    StorefrontQuoteRequestsService,
    StorefrontB2bCatalogService,
    StorefrontB2bOrdersService,
  ],
})
export class StorefrontIntegrationModule {}
