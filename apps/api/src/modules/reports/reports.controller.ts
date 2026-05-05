import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { CsvService } from './csv.service';
import { ReportsService } from './reports.service';

@UseGuards(PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly csv: CsvService,
  ) {}

  @Permissions('quote:read')
  @Get('dashboard')
  dashboard() {
    return this.reports.dashboard();
  }

  @Permissions('quote:export')
  @Get('quotes.csv')
  async quotesCsv(@Res() res: Response): Promise<void> {
    const csv = await this.csv.quotesCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="cotizaciones.csv"');
    res.send(csv);
  }

  @Permissions('stock:read')
  @Get('stock-movements.csv')
  async stockMovementsCsv(
    @Query('materialId') materialId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.csv.stockMovementsCsv(materialId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="movimientos-stock.csv"');
    res.send(csv);
  }

  @Permissions('stock:read')
  @Get('stock-snapshot.csv')
  async stockSnapshotCsv(@Res() res: Response): Promise<void> {
    const csv = await this.csv.stockSnapshotCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="stock-actual.csv"');
    res.send(csv);
  }
}
