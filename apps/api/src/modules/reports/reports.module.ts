import { Module } from '@nestjs/common';
import { CsvService } from './csv.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, CsvService],
  exports: [ReportsService, CsvService],
})
export class ReportsModule {}
