import { Global, Module } from '@nestjs/common';
import { InboundEventsService } from './inbound-events.service';

/** Idempotencia de las llamadas del sitio (plan F11·4); la usan pedidos, clientes y solicitudes. */
@Global()
@Module({
  providers: [InboundEventsService],
  exports: [InboundEventsService],
})
export class InboundEventsModule {}
