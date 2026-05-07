import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MaterialType, MaterialUnit } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { MaterialsService } from './materials.service';

const inputSchema = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().max(60).nullable().optional(),
  type: z.nativeEnum(MaterialType),
  unit: z.nativeEnum(MaterialUnit),
  parentId: z.string().nullable().optional(),
  brand: z.string().max(80).nullable().optional(),
  color: z.string().max(80).nullable().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  densityGCm3: z.number().positive().nullable().optional(),
  wastePct: z.number().min(0).max(100).optional(),
  /**
   * Logic C v3 — % aplicado sobre el costo bruto del insumo para cubrir
   * reposición de stock. No es ganancia. Cap a 500% por si alguien necesita
   * cubrir importaciones con costo de oportunidad alto.
   */
  replenishmentMarkupPct: z.number().min(0).max(500).optional(),
  currentStock: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  lowStockAlert: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

const updateSchema = inputSchema.partial().extend({ isActive: z.boolean().optional() });

const stockAdjustSchema = z.object({
  delta: z.number(),
  notes: z.string().max(2000).nullable().optional(),
});

const listQuerySchema = z.object({
  type: z.nativeEnum(MaterialType).optional(),
  activeOnly: z.coerce.boolean().optional(),
});

@UseGuards(PermissionsGuard)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Permissions('material:read')
  @Get()
  list(@Query(ZodValidation(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    return this.materials.list(query);
  }

  @Permissions('material:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.materials.get(id);
  }

  @Permissions('material:write')
  @Post()
  create(@Body(ZodValidation(inputSchema)) body: z.infer<typeof inputSchema>) {
    return this.materials.create(body);
  }

  @Permissions('material:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.materials.update(id, body);
  }

  @Permissions('material:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.materials.remove(id);
  }

  @Permissions('stock:write')
  @Post(':id/stock-adjust')
  adjustStock(
    @Param('id') id: string,
    @Body(ZodValidation(stockAdjustSchema)) body: z.infer<typeof stockAdjustSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.materials.adjustStock(id, user.sub, body.delta, body.notes ?? null);
  }
}
