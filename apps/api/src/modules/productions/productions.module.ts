import { Module } from '@nestjs/common';
import { CostingModule } from '../costing/costing.module';
import { ProductionsController } from './productions.controller';
import { ProductionsService } from './productions.service';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';

@Module({
  imports: [CostingModule],
  controllers: [ProductionsController, StockMovementsController],
  providers: [ProductionsService, StockMovementsService],
  exports: [ProductionsService, StockMovementsService],
})
export class ProductionsModule {}
