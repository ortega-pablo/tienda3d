import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { CostingModule } from '../costing/costing.module';
import { CustomersModule } from '../customers/customers.module';
import { PricingModule } from '../pricing/pricing.module';
import { ProductsModule } from '../products/products.module';
import { PdfService } from './pdf.service';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [CostingModule, PricingModule, ChannelsModule, ProductsModule, CustomersModule],
  controllers: [QuotesController],
  providers: [QuotesService, PdfService],
  exports: [QuotesService],
})
export class QuotesModule {}
