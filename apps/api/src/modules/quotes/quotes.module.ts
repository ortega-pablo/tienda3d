import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { CostingModule } from '../costing/costing.module';
import { CustomersModule } from '../customers/customers.module';
import { KeychainTiersModule } from '../keychain-tiers/keychain-tiers.module';
import { PricingModule } from '../pricing/pricing.module';
import { PdfService } from './pdf.service';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [
    CostingModule,
    PricingModule,
    ChannelsModule,
    CategoriesModule,
    CustomersModule,
    KeychainTiersModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService, PdfService],
  exports: [QuotesService],
})
export class QuotesModule {}
