import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '@/common/prisma/prisma.service';
import { hashIntegrationKey, sameHash } from './integration-keys';
import { INTEGRATION_SCOPES_KEY } from './integration-scopes.decorator';

export interface IntegrationClientRef {
  id: string;
  name: string;
  scopes: string[];
}

/** No se reescribe `lastUsedAt` en cada llamada: alcanza con una vez por minuto. */
const LAST_USED_EVERY_MS = 60_000;

/**
 * Autenticación de la API de integración (plan F11·1, §5.5): `Authorization:
 * Bearer <clave>`. Se compara el SHA-256 de la clave contra las claves activas
 * en tiempo constante (son pocas: el sitio, y dos durante una rotación).
 */
@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { integrationClient?: IntegrationClientRef }>();
    const header = req.headers.authorization ?? '';
    const match = /^Bearer (\S+)$/.exec(header);
    if (!match) throw new UnauthorizedException('Falta la clave de integración');

    const hash = hashIntegrationKey(match[1]!);
    const active = await this.prisma.integrationClient.findMany({
      where: { revokedAt: null },
      select: { id: true, name: true, keyHash: true, scopes: true, lastUsedAt: true },
    });
    // Se recorren todas para que el tiempo no dependa de cuál coincide.
    let client: (typeof active)[number] | undefined;
    for (const candidate of active) {
      if (sameHash(candidate.keyHash, hash)) client = candidate;
    }
    if (!client) throw new UnauthorizedException('Clave de integración inválida');

    const required =
      this.reflector.getAllAndOverride<string[] | undefined>(INTEGRATION_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const missing = required.filter((s) => !client.scopes.includes(s));
    if (missing.length) {
      throw new ForbiddenException(`La clave no tiene el alcance ${missing.join(', ')}`);
    }

    if (!client.lastUsedAt || Date.now() - client.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
      await this.prisma.integrationClient.update({
        where: { id: client.id },
        data: { lastUsedAt: new Date() },
      });
    }
    req.integrationClient = { id: client.id, name: client.name, scopes: client.scopes };
    return true;
  }
}
