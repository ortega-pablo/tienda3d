import { Module } from '@nestjs/common';
import { CostingModule } from '../costing/costing.module';
import { PricingModule } from '../pricing/pricing.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [CostingModule, PricingModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
