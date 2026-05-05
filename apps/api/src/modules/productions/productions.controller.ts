import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductionStatus } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { ProductionsService } from './productions.service';

const createSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  filamentOverrides: z.record(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const statusSchema = z.object({
  status: z.nativeEnum(ProductionStatus),
});

const previewQuerySchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

@UseGuards(PermissionsGuard)
@Controller('productions')
export class ProductionsController {
  constructor(private readonly productions: ProductionsService) {}

  @Permissions('production:read')
  @Get()
  list() {
    return this.productions.list();
  }

  @Permissions('production:read')
  @Get('preview')
  preview(@Query(ZodValidation(previewQuerySchema)) query: z.infer<typeof previewQuerySchema>) {
    return this.productions.previewConsumption(query.productId, query.quantity);
  }

  @Permissions('production:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.productions.get(id);
  }

  @Permissions('production:execute')
  @Post()
  create(
    @Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.productions.create(body, user.sub);
  }

  @Permissions('production:execute')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body(ZodValidation(statusSchema)) body: z.infer<typeof statusSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.productions.setStatus(id, body.status, user.sub);
  }
}
