import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { CategoriesService } from './categories.service';
import { CategoryTiersService } from './category-tiers.service';

const inputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(120).optional(),
  icon: z.string().max(80).nullable().optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  notes: z.string().max(2000).nullable().optional(),
  baseMarkupPct: z.number().min(0).max(10000).nullable().optional(),
});

const updateSchema = inputSchema.partial();

const listQuerySchema = z.object({
  activeOnly: z.coerce.boolean().optional(),
  /** Si flat=true devuelve listado plano sin anidar children. */
  flat: z.coerce.boolean().optional(),
});

const tiersQuerySchema = z.object({
  channelId: z.string().min(1),
});

const tierItemSchema = z.object({
  minQty: z.number().int().min(1),
  maxQty: z.number().int().min(1).nullable(),
  markupPct: z.number().min(0).max(10000),
  notes: z.string().max(1000).nullable().optional(),
});

const replaceTiersSchema = z.object({
  channelId: z.string().min(1),
  tiers: z.array(tierItemSchema),
});

@UseGuards(PermissionsGuard)
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly tiers: CategoryTiersService,
  ) {}

  @Permissions('category:read')
  @Get()
  list(@Query(ZodValidation(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    if (query.flat) return this.categories.listFlat({ activeOnly: query.activeOnly });
    return this.categories.listTree({ activeOnly: query.activeOnly });
  }

  @Permissions('category:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.categories.get(id);
  }

  @Permissions('category:write')
  @Post()
  create(@Body(ZodValidation(inputSchema)) body: z.infer<typeof inputSchema>) {
    return this.categories.create(body);
  }

  @Permissions('category:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.categories.update(id, body);
  }

  @Permissions('category:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.categories.remove(id);
  }

  // ----- Tiers de la categoría por canal -----

  /**
   * Tiers efectivos para `(categoryId, channelId)`, marcando si son propios
   * o heredados del padre. Si la categoría no tiene tiers propios ni hereda,
   * `tiers` viene vacío y el caller se apoya en `baseMarkupPct`.
   */
  @Permissions('category:read')
  @Get(':id/tiers')
  listTiers(
    @Param('id') id: string,
    @Query(ZodValidation(tiersQuerySchema)) query: z.infer<typeof tiersQuerySchema>,
  ) {
    return this.tiers.list(id, query.channelId);
  }

  /**
   * Reemplaza atómicamente el set de tiers de `(categoryId, channelId)`.
   * Body `tiers: []` borra las propias (vuelve a heredar del padre).
   */
  @Permissions('category:write')
  @Put(':id/tiers')
  replaceTiers(
    @Param('id') id: string,
    @Body(ZodValidation(replaceTiersSchema)) body: z.infer<typeof replaceTiersSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.tiers.replaceForCategory(id, body.channelId, body.tiers, user.sub);
  }
}
