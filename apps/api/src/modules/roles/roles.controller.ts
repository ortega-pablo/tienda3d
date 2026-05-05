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
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { RolesService } from './roles.service';

const createSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(240).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(240).nullable().optional(),
});

const permissionsSchema = z.object({
  permissions: z.array(z.string().min(1)),
});

@UseGuards(PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Permissions('user:read')
  @Get()
  list() {
    return this.roles.list();
  }

  @Permissions('user:read')
  @Get('permissions')
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Permissions('role:manage')
  @Post()
  create(@Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>) {
    return this.roles.create(body);
  }

  @Permissions('role:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.roles.update(id, body);
  }

  @Permissions('role:manage')
  @Put(':id/permissions')
  setPermissions(
    @Param('id') id: string,
    @Body(ZodValidation(permissionsSchema)) body: z.infer<typeof permissionsSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    return this.roles.setPermissions(id, body.permissions, user.sub);
  }

  @Permissions('role:manage')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.roles.remove(id);
  }
}
