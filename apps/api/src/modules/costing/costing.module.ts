import { Module } from '@nestjs/common';
import { MachinesModule } from '../machines/machines.module';
import { CostingCalculator } from './costing.calculator';
import { CostingService } from './costing.service';

@Module({
  imports: [MachinesModule],
  providers: [CostingCalculator, CostingService],
  exports: [CostingCalculator, CostingService],
})
export class CostingModule {}
