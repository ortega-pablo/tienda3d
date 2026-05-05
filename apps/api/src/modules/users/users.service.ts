import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  role: { id: string; name: string };
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserListItem[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
      },
    });
  }

  async create(input: {
    email: string;
    name: string;
    password: string;
    roleId: string;
  }): Promise<UserListItem> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictException('Email ya registrado');

    const role = await this.prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw new NotFoundException('Rol inexistente');

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        roleId: input.roleId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
      },
    });
    return user;
  }

  async update(
    id: string,
    input: { name?: string; roleId?: string; isActive?: boolean },
  ): Promise<UserListItem> {
    if (input.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: input.roleId } });
      if (!role) throw new NotFoundException('Rol inexistente');
    }
    return this.prisma.user
      .update({
        where: { id },
        data: input,
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          createdAt: true,
          role: { select: { id: true, name: true } },
        },
      })
      .catch(() => {
        throw new NotFoundException('Usuario inexistente');
      });
  }

  async changePassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    // Revoke all refresh tokens to force re-login
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
