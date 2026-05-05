import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { StockMovementsService } from './stock-movements.service';

const querySchema = z.object({
  materialId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

@UseGuards(PermissionsGuard)
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly movements: StockMovementsService) {}

  @Permissions('stock:read')
  @Get()
  list(@Query(ZodValidation(querySchema)) query: z.infer<typeof querySchema>) {
    return this.movements.list(query);
  }
}
