import { Module } from '@nestjs/common';
import { DocumentCodeService } from '@/common/utils/document-code';
import { WebOrdersService } from './web-orders.service';

/** Pedidos de la tienda online (plan F14). */
@Module({
  providers: [WebOrdersService, DocumentCodeService],
  exports: [WebOrdersService],
})
export class WebOrdersModule {}
