import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { MaterialPricesController } from './material-prices.controller';
import { MaterialPricesService } from './material-prices.service';

@Module({
  controllers: [MaterialsController, MaterialPricesController],
  providers: [MaterialsService, MaterialPricesService],
  exports: [MaterialsService, MaterialPricesService],
})
export class MaterialsModule {}
