import { Module } from '@nestjs/common';
import { CostingModule } from '../costing/costing.module';
import { PricingModule } from '../pricing/pricing.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductTiersController } from './product-tiers.controller';
import { ProductTiersService } from './product-tiers.service';

@Module({
  imports: [CostingModule, PricingModule],
  controllers: [ProductsController, ProductTiersController],
  providers: [ProductsService, ProductTiersService],
  exports: [ProductsService, ProductTiersService],
})
export class ProductsModule {}
