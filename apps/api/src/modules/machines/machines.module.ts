import { Module } from '@nestjs/common';
import { MachineHourService } from './machine-hour.service';
import { MachinesController } from './machines.controller';
import { MachinesService } from './machines.service';

@Module({
  controllers: [MachinesController],
  providers: [MachinesService, MachineHourService],
  exports: [MachinesService, MachineHourService],
})
export class MachinesModule {}
