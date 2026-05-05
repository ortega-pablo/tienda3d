import { Module } from '@nestjs/common';
import { CostingModule } from '../costing/costing.module';
import { PricingEngine } from './pricing.engine';
import { PricingService } from './pricing.service';

@Module({
  imports: [CostingModule],
  providers: [PricingEngine, PricingService],
  exports: [PricingEngine, PricingService],
})
export class PricingModule {}
