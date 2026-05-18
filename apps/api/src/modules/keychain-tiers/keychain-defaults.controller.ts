import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { KeychainDefaultsService } from './keychain-defaults.service';

const updateSchema = z.object({
  pieceName: z.string().min(1).max(120),
  pieceGrams: z.number().nonnegative(),
  piecePrintMinutes: z.number().nonnegative(),
  pieceFilamentId: z.string().min(1).nullable(),
  assemblyMinutes: z.number().nonnegative(),
  managementMinutes: z.number().nonnegative(),
  materials: z.array(
    z.object({
      materialId: z.string().min(1),
      quantity: z.number().positive(),
    }),
  ),
});

@UseGuards(PermissionsGuard)
@Controller('keychain-defaults')
export class KeychainDefaultsController {
  constructor(private readonly defaults: KeychainDefaultsService) {}

  @Permissions('parameter:read')
  @Get()
  get() {
    return this.defaults.get();
  }

  @Permissions('parameter:write')
  @Put()
  update(
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.defaults.update(body, user.sub);
  }
}
