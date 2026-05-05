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
import { MachineHourService } from './machine-hour.service';
import { MachinesService } from './machines.service';

const inputSchema = z.object({
  name: z.string().min(1).max(120),
  acquisitionCost: z.number().nonnegative(),
  residualValue: z.number().nonnegative(),
  usefulLifeHours: z.number().positive(),
  powerW: z.number().nonnegative(),
  annualMaintenance: z.number().nonnegative(),
  annualUsageHours: z.number().positive(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateSchema = inputSchema.partial();

@UseGuards(PermissionsGuard)
@Controller('machines')
export class MachinesController {
  constructor(
    private readonly machines: MachinesService,
    private readonly hour: MachineHourService,
  ) {}

  @Permissions('machine:read')
  @Get()
  list() {
    return this.machines.list();
  }

  @Permissions('machine:read')
  @Get('active/hour-cost')
  hourCost() {
    return this.hour.computeActive();
  }

  @Permissions('machine:write')
  @Post()
  create(@Body(ZodValidation(inputSchema)) body: z.infer<typeof inputSchema>) {
    return this.machines.create(body);
  }

  @Permissions('machine:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.machines.update(id, body);
  }

  @Permissions('machine:write')
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.machines.activate(id);
  }

  @Permissions('machine:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.machines.remove(id);
  }
}
