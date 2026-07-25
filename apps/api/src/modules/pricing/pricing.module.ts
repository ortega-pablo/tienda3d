import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { CostingModule } from '../costing/costing.module';
import { KeychainScaleTiersModule } from '../keychain-scale-tiers/keychain-scale-tiers.module';
import { PricingEngine } from './pricing.engine';
import { PricingService } from './pricing.service';

@Module({
  imports: [CostingModule, CategoriesModule, KeychainScaleTiersModule],
  providers: [PricingEngine, PricingService],
  exports: [PricingEngine, PricingService],
})
export class PricingModule {}
