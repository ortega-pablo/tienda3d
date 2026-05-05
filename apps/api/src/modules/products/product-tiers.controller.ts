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
import { ProductTiersService } from './product-tiers.service';

const createSchema = z.object({
  minQty: z.number().int().min(1),
  maxQty: z.number().int().nullable().optional(),
  markupPct: z.number().min(0).max(1000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const updateSchema = createSchema.partial();

@UseGuards(PermissionsGuard)
@Controller('products/:productId/tiers')
export class ProductTiersController {
  constructor(private readonly tiers: ProductTiersService) {}

  @Permissions('product:read')
  @Get()
  list(@Param('productId') productId: string) {
    return this.tiers.list(productId);
  }

  @Permissions('product:write')
  @Post()
  create(
    @Param('productId') productId: string,
    @Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.tiers.create(productId, body);
  }

  @Permissions('product:write')
  @Patch(':tierId')
  update(
    @Param('productId') productId: string,
    @Param('tierId') tierId: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.tiers.update(productId, tierId, body);
  }

  @Permissions('product:write')
  @Delete(':tierId')
  @HttpCode(204)
  async remove(
    @Param('productId') productId: string,
    @Param('tierId') tierId: string,
  ): Promise<void> {
    await this.tiers.remove(productId, tierId);
  }
}
