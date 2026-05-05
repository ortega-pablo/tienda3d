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
import { SuppliersService } from './suppliers.service';

const createSchema = z.object({
  name: z.string().min(1).max(160),
  contact: z.string().max(160).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

@UseGuards(PermissionsGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Permissions('supplier:read')
  @Get()
  list() {
    return this.suppliers.list();
  }

  @Permissions('supplier:write')
  @Post()
  create(@Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>) {
    return this.suppliers.create(body);
  }

  @Permissions('supplier:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.suppliers.update(id, body);
  }

  @Permissions('supplier:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.suppliers.remove(id);
  }
}
