import { Module } from '@nestjs/common';
import { WebCatalogModule } from '@/modules/web-catalog/web-catalog.module';
import { WebOrdersModule } from '@/modules/web-orders/web-orders.module';
import { IntegrationAuthGuard } from '@/common/integration-auth/integration-auth.guard';
import { StorefrontIntegrationController } from './storefront-integration.controller';
import { StorefrontOrderEventsService } from './storefront-order-events.service';
import { StorefrontOrdersService } from './storefront-orders.service';
import { WebCustomersService } from './web-customers.service';

/** Lo que el sitio le pide al sistema: pedidos, clientes, solicitudes (plan F11–F15). */
@Module({
  imports: [WebCatalogModule, WebOrdersModule],
  controllers: [StorefrontIntegrationController],
  providers: [
    IntegrationAuthGuard,
    WebCustomersService,
    StorefrontOrdersService,
    StorefrontOrderEventsService,
  ],
})
export class StorefrontIntegrationModule {}
