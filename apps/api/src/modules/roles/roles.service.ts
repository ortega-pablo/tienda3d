import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((rp) => rp.permission.key),
      userCount: r._count.users,
    }));
  }

  async listPermissions(): Promise<{ key: string; description: string | null }[]> {
    return this.prisma.permission.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, description: true },
    });
  }

  async create(input: { name: string; description?: string }): Promise<RoleDto> {
    const exists = await this.prisma.role.findUnique({ where: { name: input.name } });
    if (exists) throw new BadRequestException('Ya existe un rol con ese nombre');
    const role = await this.prisma.role.create({
      data: { name: input.name, description: input.description, isSystem: false },
    });
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: [],
      userCount: 0,
    };
  }

  async update(
    id: string,
    input: { name?: string; description?: string | null },
  ): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rol inexistente');
    if (role.isSystem && input.name && input.name !== role.name) {
      throw new BadRequestException('No se puede renombrar un rol del sistema');
    }
    await this.prisma.role.update({ where: { id }, data: input });
    const list = await this.list();
    return list.find((r) => r.id === id) as RoleDto;
  }

  async setPermissions(
    roleId: string,
    permissionKeys: string[],
    actorId: string,
  ): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Rol inexistente');

    const perms = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });
    if (perms.length !== permissionKeys.length) {
      throw new BadRequestException('Una o más claves de permiso son inválidas');
    }

    const before = role.permissions.map((rp) => rp.permission.key).sort();
    const after = [...permissionKeys].sort();

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);

    await this.audit.record({
      actorId,
      entity: 'Role',
      entityId: roleId,
      action: 'set-permissions',
      before: { permissions: before },
      after: { permissions: after },
    });

    const list = await this.list();
    return list.find((r) => r.id === roleId) as RoleDto;
  }

  async remove(id: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Rol inexistente');
    if (role.isSystem) throw new BadRequestException('No se puede eliminar un rol del sistema');
    if (role._count.users > 0) {
      throw new BadRequestException('Reasigne los usuarios antes de eliminar el rol');
    }
    await this.prisma.role.delete({ where: { id } });
  }
}
