import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { KeychainTiersService } from './keychain-tiers.service';

const updateSchema = z.object({
  markupPct: z.number().nonnegative(),
});

@UseGuards(PermissionsGuard)
@Controller('keychain-tiers')
export class KeychainTiersController {
  constructor(private readonly tiers: KeychainTiersService) {}

  @Permissions('parameter:read')
  @Get()
  list() {
    return this.tiers.list();
  }

  @Permissions('parameter:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.tiers.updateMarkup(id, body.markupPct, user.sub);
  }
}
