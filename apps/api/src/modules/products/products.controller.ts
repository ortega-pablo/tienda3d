import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { CostingService } from '../costing/costing.service';
import { PricingService } from '../pricing/pricing.service';
import { ProductsService } from './products.service';

const pieceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  grams: z.number().positive(),
  printMinutes: z.number().nonnegative(),
  defaultFilamentId: z.string().nullable(),
  sortOrder: z.number().int().optional(),
});

const materialLineSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().positive(),
});

const channelLineSchema = z.object({
  channelId: z.string().min(1),
  isEnabled: z.boolean(),
  commissionPct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const inputSchema = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().max(60).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  marketingMonthly: z.number().nonnegative(),
  estimatedUnitsMonth: z.number().positive(),
  assemblyMinutes: z.number().nonnegative(),
  managementMinutes: z.number().nonnegative(),
  targetMarkupPct: z.number().min(0).max(1000),
  machineId: z.string().min(1).nullable(),
  pieces: z.array(pieceSchema).min(0),
  materials: z.array(materialLineSchema).min(0),
  channels: z.array(channelLineSchema).optional(),
});

const overridesSchema = z.object({
  filamentOverrides: z.record(z.string()).optional(),
});

@UseGuards(PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly costing: CostingService,
    private readonly pricing: PricingService,
  ) {}

  @Permissions('product:read')
  @Get()
  list() {
    return this.products.list();
  }

  @Permissions('product:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Permissions('product:read')
  @Get(':id/cost')
  cost(@Param('id') id: string) {
    return this.costing.forProduct(id);
  }

  @Permissions('product:read')
  @Post(':id/cost')
  costWithOverrides(
    @Param('id') id: string,
    @Body(ZodValidation(overridesSchema)) body: z.infer<typeof overridesSchema>,
  ) {
    return this.costing.forProduct(id, body);
  }

  @Permissions('product:read')
  @Get(':id/prices')
  prices(@Param('id') id: string) {
    return this.pricing.forProduct(id);
  }

  @Permissions('product:write')
  @Post()
  create(@Body(ZodValidation(inputSchema)) body: z.infer<typeof inputSchema>) {
    return this.products.create(body);
  }

  @Permissions('product:write')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(inputSchema)) body: z.infer<typeof inputSchema>,
  ) {
    return this.products.update(id, body);
  }

  @Permissions('product:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.products.remove(id);
  }
}
