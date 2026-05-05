import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { MachineHourService } from '../machines/machine-hour.service';
import { ParametersService } from './parameters.service';

const patchSchema = z.object({
  values: z.record(z.string()),
});

@UseGuards(PermissionsGuard)
@Controller('parameters')
export class ParametersController {
  constructor(
    private readonly params: ParametersService,
    private readonly machineHour: MachineHourService,
  ) {}

  @Permissions('parameter:read')
  @Get()
  list() {
    return this.params.list();
  }

  @Permissions('parameter:read')
  @Get('machine-hour')
  machineHourCost() {
    return this.machineHour.computeActive();
  }

  @Permissions('parameter:write')
  @Patch()
  update(
    @Body(ZodValidation(patchSchema)) body: z.infer<typeof patchSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.params.update(body.values, user.sub);
  }
}
