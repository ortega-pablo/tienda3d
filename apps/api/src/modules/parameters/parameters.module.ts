import { Module } from '@nestjs/common';
import { MachinesModule } from '../machines/machines.module';
import { ParametersController } from './parameters.controller';
import { ParametersService } from './parameters.service';

@Module({
  imports: [MachinesModule],
  controllers: [ParametersController],
  providers: [ParametersService],
  exports: [ParametersService],
})
export class ParametersModule {}
