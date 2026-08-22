import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '@/common/prisma/prisma.service';

/** Mensaje único para todos los fallos de login: no filtra si el mail existe. */
const INVALID_CREDENTIALS = 'Credenciales inválidas';
/** Fallidos consecutivos antes de bloquear la cuenta. */
const MAX_FAILED_ATTEMPTS = 8;
/** Duración del bloqueo, en minutos. */
const LOCKOUT_MINUTES = 15;

export interface AccessPayload {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
}

interface RefreshPayload {
  sub: string;
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Login con bloqueo por cuenta.
   *
   * El rate limit del throttler es por IP, y la IP es débil como clave: todos
   * los usuarios entran por la del contenedor `web`, y detrás de NAT comparten
   * la de la oficina. El contador por cuenta no depende de la red — tras
   * MAX_FAILED_ATTEMPTS fallidos consecutivos el usuario queda bloqueado
   * LOCKOUT_MINUTES, cambie de IP quien lo intente.
   *
   * Todas las salidas de error devuelven el MISMO mensaje: si el bloqueo
   * dijera "cuenta bloqueada" y el usuario inexistente dijera otra cosa, el
   * endpoint serviría para enumerar mails registrados.
   */
  async login(email: string, password: string): Promise<{
    user: AuthenticatedUser;
    accessToken: string;
    accessExpiresIn: number;
    refreshToken: string;
    refreshExpiresIn: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException(INVALID_CREDENTIALS);

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Login correcto: se limpia el contador y cualquier bloqueo vencido.
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const permissions = user.role.permissions.map((rp) => rp.permission.key);
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions,
    };
    const access = await this.signAccess(authUser);
    const refresh = await this.issueRefresh(user.id);

    return {
      user: authUser,
      accessToken: access.token,
      accessExpiresIn: access.expiresIn,
      refreshToken: refresh.token,
      refreshExpiresIn: refresh.expiresIn,
    };
  }

  async refresh(rawToken: string): Promise<{
    accessToken: string;
    accessExpiresIn: number;
    refreshToken: string;
    refreshExpiresIn: number;
  }> {
    const refreshSecret = this.config.getOrThrow<string>('REFRESH_SECRET');
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(rawToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh inválido');
    }

    const tokenHash = this.hash(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.id !== payload.jti || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh inválido');
    }
    if (stored.revokedAt) throw new UnauthorizedException('Refresh revocado');
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh expirado');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Usuario inactivo');

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    };
    const access = await this.signAccess(authUser);
    const newRefresh = await this.issueRefresh(user.id);

    return {
      accessToken: access.token,
      accessExpiresIn: access.expiresIn,
      refreshToken: newRefresh.token,
      refreshExpiresIn: newRefresh.expiresIn,
    };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    const tokenHash = this.hash(rawRefresh);
    await this.prisma.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  async getCurrentUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.isActive) throw new ForbiddenException();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    };
  }

  private async signAccess(user: AuthenticatedUser): Promise<{ token: string; expiresIn: number }> {
    const expiresIn = this.parseExpiry(this.config.get<string>('JWT_EXPIRES_IN', '15m'));
    const payload: AccessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };
    const token = await this.jwt.signAsync(payload, { expiresIn });
    return { token, expiresIn };
  }

  private async issueRefresh(userId: string): Promise<{ token: string; expiresIn: number }> {
    const refreshSecret = this.config.getOrThrow<string>('REFRESH_SECRET');
    const expiresIn = this.parseExpiry(this.config.get<string>('REFRESH_EXPIRES_IN', '7d'));
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Pre-create the record so we have its id (jti) to embed in the token.
    const placeholder = await this.prisma.refreshToken.create({
      data: { userId, tokenHash: crypto.randomUUID(), expiresAt },
    });
    const token = await this.jwt.signAsync(
      { sub: userId, jti: placeholder.id },
      { secret: refreshSecret, expiresIn },
    );
    await this.prisma.refreshToken.update({
      where: { id: placeholder.id },
      data: { tokenHash: this.hash(token) },
    });
    return { token, expiresIn };
  }

  /**
   * Suma un intento fallido y bloquea la cuenta al llegar al máximo.
   * Best-effort: si la escritura falla no se convierte un 401 en un 500.
   */
  private async registerFailedAttempt(userId: string, current: number): Promise<void> {
    const attempts = current + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await this.prisma.user
      .update({
        where: { id: userId },
        data: {
          failedLoginAttempts: locked ? 0 : attempts,
          lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
        },
      })
      .catch(() => undefined);
  }

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(value: string): number {
    // Accepts '15m', '7d', '3600' (seconds)
    const m = value.match(/^(\d+)([smhd])?$/);
    if (!m || !m[1]) return 900;
    const n = Number(m[1]);
    switch (m[2]) {
      case 's': return n;
      case 'm': return n * 60;
      case 'h': return n * 3600;
      case 'd': return n * 86400;
      default: return n;
    }
  }
}
