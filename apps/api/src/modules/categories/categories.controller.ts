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
import { z } from 'zod';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';

const inputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(120).optional(),
  icon: z.string().max(80).nullable().optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateSchema = inputSchema.partial();

const listQuerySchema = z.object({
  activeOnly: z.coerce.boolean().optional(),
  /** Si flat=true devuelve listado plano sin anidar children. */
  flat: z.coerce.boolean().optional(),
});

@UseGuards(PermissionsGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

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
}
