import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  generateIntegrationKey,
  INTEGRATION_SCOPES,
} from '@/common/integration-auth/integration-keys';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppModule } from '@/app.module';
import { TEST_DATABASE_URL } from '../../../test/db-url';
import { truncateAll } from '../../../test/harness';

/**
 * F11·1: solo el sitio, con su clave, llama a la API de integración. Por HTTP,
 * con el guard global de JWT activo como en main.ts.
 */
describe('[int] API de integración: autenticación', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.integrationClient.deleteMany();
  });

  const issue = async (scopes: string[] = [...INTEGRATION_SCOPES], name = 'storefront') => {
    const { key, hash, prefix } = generateIntegrationKey();
    const client = await prisma.integrationClient.create({
      data: { name, keyHash: hash, keyPrefix: prefix, scopes },
    });
    return { key, id: client.id };
  };
  /** El comando de claves, como se corre en el contenedor, contra la base de tests. */
  const cli = (args: string[], input = '') =>
    execFileSync(
      join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'tsx'),
      ['scripts/integration-key.ts', ...args],
      {
        cwd: join(__dirname, '..', '..', '..'),
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        encoding: 'utf8',
        input,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ).trim();
  const ping = (auth?: string) => {
    const req = request(app.getHttpServer()).get('/integrations/storefront/v1/ping');
    return auth ? req.set('Authorization', auth) : req;
  };

  it('sin clave o con una clave inventada da 401', async () => {
    await ping().expect(401);
    await ping('Bearer tp_inventada').expect(401);
    await ping('Basic algo').expect(401);
  });

  it('con la clave del sitio responde y registra el uso', async () => {
    const { key, id } = await issue();
    const res = await ping(`Bearer ${key}`).expect(200);
    expect(res.body).toMatchObject({ ok: true, client: 'storefront' });
    const client = await prisma.integrationClient.findUniqueOrThrow({ where: { id } });
    expect(client.lastUsedAt).not.toBeNull();
  });

  it('una clave revocada da 401', async () => {
    const { key, id } = await issue();
    await prisma.integrationClient.update({ where: { id }, data: { revokedAt: new Date() } });
    await ping(`Bearer ${key}`).expect(401);
  });

  it('una clave sin el alcance pedido da 403', async () => {
    const { key } = await issue(['orders:write']);
    const res = await ping(`Bearer ${key}`).expect(403);
    expect((res.body as { message: string }).message).toMatch(/alcance ping/);
  });

  it('durante una rotación sirven las dos claves activas', async () => {
    const vieja = await issue();
    const nueva = await issue();
    await ping(`Bearer ${vieja.key}`).expect(200);
    await ping(`Bearer ${nueva.key}`).expect(200);
  });

  it('un token de usuario no sirve como clave de integración', async () => {
    const jwt = app.get(JwtService).sign({
      sub: 'u-admin',
      email: 'admin@plastik.local',
      role: 'admin',
      permissions: ['ecommerce:read', 'ecommerce:write'],
    });
    await ping(`Bearer ${jwt}`).expect(401);
  });

  it('el comando emite una clave que funciona y la revoca', async () => {
    const key = cli(['issue', 'storefront-cli']);
    expect(key).toMatch(/^tp_[A-Za-z0-9_-]{43}$/);
    // Se guarda el hash, nunca la clave.
    const stored = await prisma.integrationClient.findFirstOrThrow({
      where: { name: 'storefront-cli' },
    });
    expect(stored.keyHash).not.toContain(key.slice(3));
    await ping(`Bearer ${key}`).expect(200);

    expect(cli(['revoke', key.slice(0, 9)])).toMatch(/1 clave\(s\) revocada/);
    await ping(`Bearer ${key}`).expect(401);
  });

  it('registra una clave generada afuera (el secreto de infra), una sola vez', async () => {
    const secreto = 'a'.repeat(16) + 'b'.repeat(16) + 'c'.repeat(16) + '\n';

    expect(cli(['register', 'storefront'], secreto)).toMatch(/Clave registrada/);
    expect(cli(['register', 'storefront'], secreto)).toMatch(/ya estaba registrada/);
    expect(await prisma.integrationClient.count()).toBe(1);
    await ping(`Bearer ${secreto.trim()}`).expect(200);
  });
});
