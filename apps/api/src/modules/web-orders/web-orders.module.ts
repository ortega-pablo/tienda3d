import { Module } from '@nestjs/common';
import { DocumentCodeService } from '@/common/utils/document-code';
import { WebCatalogModule } from '@/modules/web-catalog/web-catalog.module';
import { WebOrdersController } from './web-orders.controller';
import { WebOrdersService } from './web-orders.service';

/** Pedidos de la tienda online (plan F14). */
@Module({
  imports: [WebCatalogModule],
  controllers: [WebOrdersController],
  providers: [WebOrdersService, DocumentCodeService],
  exports: [WebOrdersService],
})
export class WebOrdersModule {}
