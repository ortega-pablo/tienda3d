import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { MaterialPricesService } from './material-prices.service';

const createSchema = z
  .object({
    supplierId: z.string().min(1),
    price: z.number().positive().optional(),
    packSize: z.number().positive().nullable().optional(),
    packPrice: z.number().positive().nullable().optional(),
    currency: z.string().length(3).optional(),
    link: z.string().url().nullable().optional(),
    leadTimeDays: z.number().int().min(0).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    setCurrent: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.price != null || (v.packSize != null && v.packPrice != null),
    { message: 'Cargá precio por unidad, o cantidad + precio del paquete.' },
  )
  .refine(
    (v) => !(v.price != null && (v.packSize != null || v.packPrice != null)),
    { message: 'No combines precio por unidad con paquete.' },
  );

@UseGuards(PermissionsGuard)
@Controller('materials/:materialId/prices')
export class MaterialPricesController {
  constructor(private readonly prices: MaterialPricesService) {}

  @Permissions('material:read')
  @Get()
  list(@Param('materialId') materialId: string) {
    return this.prices.list(materialId);
  }

  @Permissions('material:write')
  @Post()
  create(
    @Param('materialId') materialId: string,
    @Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.prices.create(materialId, body);
  }

  @Permissions('material:write')
  @Patch(':priceId/current')
  setCurrent(@Param('materialId') materialId: string, @Param('priceId') priceId: string) {
    return this.prices.setCurrent(materialId, priceId);
  }

  @Permissions('material:write')
  @Delete(':priceId')
  @HttpCode(204)
  async remove(
    @Param('materialId') materialId: string,
    @Param('priceId') priceId: string,
  ): Promise<void> {
    await this.prices.remove(materialId, priceId);
  }
}
