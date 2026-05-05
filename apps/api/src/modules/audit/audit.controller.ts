import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { AuditService } from './audit.service';

const querySchema = z.object({
  entity: z.string().optional(),
  actorId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

@UseGuards(PermissionsGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Permissions('audit:read')
  @Get()
  list(@Query(ZodValidation(querySchema)) query: z.infer<typeof querySchema>) {
    return this.audit.list(query);
  }
}
