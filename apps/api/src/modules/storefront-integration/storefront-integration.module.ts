import { Module } from '@nestjs/common';
import { IntegrationAuthGuard } from '@/common/integration-auth/integration-auth.guard';
import { StorefrontIntegrationController } from './storefront-integration.controller';
import { WebCustomersService } from './web-customers.service';

/** Lo que el sitio le pide al sistema: pedidos, clientes, solicitudes (plan F11–F15). */
@Module({
  controllers: [StorefrontIntegrationController],
  providers: [IntegrationAuthGuard, WebCustomersService],
})
export class StorefrontIntegrationModule {}
