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
import { ChannelKind, InvoiceType, TaxMode } from '@prisma/client';
import { z } from 'zod';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { ChannelsService } from './channels.service';

const createSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  icon: z.string().max(8).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  kind: z.nativeEnum(ChannelKind).default(ChannelKind.CUSTOM),
  commissionPct: z.number().min(0).max(100),
  withInvoiceDefault: z.boolean().optional(),
  taxMode: z.nativeEnum(TaxMode),
  unifiedRegimePct: z.number().min(0).max(100).nullable().optional(),
  iibbPct: z.number().min(0).max(100).nullable().optional(),
  appliesIva: z.boolean().optional(),
  defaultInvoiceType: z.nativeEnum(InvoiceType).optional(),
  retentionIvaPct: z.number().min(0).max(100).nullable().optional(),
  retentionIibbPct: z.number().min(0).max(100).nullable().optional(),
  retentionIncomePct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateSchema = createSchema.partial();

@UseGuards(PermissionsGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Permissions('channel:read')
  @Get()
  list() {
    return this.channels.list();
  }

  @Permissions('channel:read')
  @Get(':id/impact')
  impact(@Param('id') id: string) {
    return this.channels.impact(id);
  }

  @Permissions('channel:write')
  @Post()
  create(@Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>) {
    return this.channels.create(body);
  }

  @Permissions('channel:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.channels.update(id, body);
  }

  @Permissions('channel:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.channels.remove(id);
  }
}
