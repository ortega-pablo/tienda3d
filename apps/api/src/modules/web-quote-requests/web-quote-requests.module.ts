import { Module } from '@nestjs/common';
import { WebQuoteRequestsController } from './web-quote-requests.controller';
import { WebQuoteRequestsService } from './web-quote-requests.service';

/** Solicitudes de personalización de la tienda online en el panel (plan F15·3). */
@Module({
  controllers: [WebQuoteRequestsController],
  providers: [WebQuoteRequestsService],
  exports: [WebQuoteRequestsService],
})
export class WebQuoteRequestsModule {}
