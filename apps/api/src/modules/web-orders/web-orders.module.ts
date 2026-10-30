import { Module } from '@nestjs/common';
import { DocumentCodeService } from '@/common/utils/document-code';
import { OutboxModule } from '@/modules/outbox/outbox.module';
import { ProductionsModule } from '@/modules/productions/productions.module';
import { WebCatalogModule } from '@/modules/web-catalog/web-catalog.module';
import { WebOrdersController } from './web-orders.controller';
import { WebOrderDeadlinesService } from './web-order-deadlines.service';
import { WebOrdersService } from './web-orders.service';

/** Pedidos de la tienda online (plan F14). */
@Module({
  imports: [WebCatalogModule, OutboxModule, ProductionsModule],
  controllers: [WebOrdersController],
  providers: [WebOrdersService, WebOrderDeadlinesService, DocumentCodeService],
  exports: [WebOrdersService, WebOrderDeadlinesService],
})
export class WebOrdersModule {}
