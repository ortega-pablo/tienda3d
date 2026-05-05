import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8),
  roleId: z.string().min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  password: z.string().min(8),
});

@UseGuards(PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Permissions('user:read')
  @Get()
  list() {
    return this.users.list();
  }

  @Permissions('user:manage')
  @Post()
  create(@Body(ZodValidation(createSchema)) body: z.infer<typeof createSchema>) {
    return this.users.create(body);
  }

  @Permissions('user:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.users.update(id, body);
  }

  @Permissions('user:manage')
  @Patch(':id/password')
  async changePassword(
    @Param('id') id: string,
    @Body(ZodValidation(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
  ): Promise<{ ok: true }> {
    await this.users.changePassword(id, body.password);
    return { ok: true };
  }
}
