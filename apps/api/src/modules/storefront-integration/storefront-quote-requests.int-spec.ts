import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  generateIntegrationKey,
  INTEGRATION_SCOPES,
} from '@/common/integration-auth/integration-keys';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { AppModule } from '@/app.module';
import { truncateAll } from '../../../test/harness';

/**
 * F15·2: el sistema recibe las solicitudes de personalización del sitio, con
 * su archivo en el volumen privado. Una entrega repetida no la duplica y un
 * adjunto que no cumple las reglas no entra.
 */
describe('[int] Solicitudes de personalización del sitio', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let key: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'quote-requests-'));
    const storage = new StorageService({
      media: join(base, 'media'),
      private: join(base, 'private'),
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    await rm(base, { recursive: true, force: true });
  });

  const newKey = async (scopes: string[]) => {
    const generated = generateIntegrationKey();
    await prisma.integrationClient.create({
      data: {
        name: `storefront-${generated.prefix}`,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scopes,
      },
    });
    return generated.key;
  };

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.integrationClient.deleteMany();
    await rm(join(base, 'private'), { recursive: true, force: true });
    key = await newKey([...INTEGRATION_SCOPES]);
  });

  const data = (externalId = 'qr-1') => ({
    externalId,
    customer: {
      externalId: 'web-ana',
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Prueba',
      phone: '+54 9 261 555-0000',
      documentNumber: null,
    },
    idea: 'Un soporte para auriculares con mi nombre grabado.',
    requestedAt: '2026-10-29T15:00:00Z',
  });

  const send = (body: object, file?: { content: Buffer; name: string }, auth: string = key) => {
    const req = request(app.getHttpServer())
      .post('/integrations/storefront/v1/quote-requests')
      .set('Authorization', `Bearer ${auth}`)
      .field('data', JSON.stringify(body));
    return file ? req.attach('attachment', file.content, file.name) : req;
  };
  const stored = async () => {
    try {
      return await readdir(join(base, 'private', 'quote-requests'));
    } catch {
      return [];
    }
  };
  const stl = { content: Buffer.from('solid soporte\nendsolid soporte\n'), name: 'soporte.stl' };

  it('la guarda vinculada al cliente, con el archivo en el volumen privado', async () => {
    const res = await send(data(), stl).expect(201);
    expect(res.body).toEqual({ id: expect.any(String), replayed: false });

    const saved = await prisma.webQuoteRequest.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { customer: true },
    });
    expect(saved).toMatchObject({
      externalId: 'qr-1',
      name: 'Ana Prueba',
      email: 'ana@example.com',
      status: 'NEW',
      attachmentName: 'soporte.stl',
      attachmentSize: stl.content.length,
      requestedAt: new Date('2026-10-29T15:00:00Z'),
      customer: { externalId: 'web-ana', source: 'WEB' },
    });
    expect(saved.attachmentPath).toMatch(/^quote-requests\/[0-9a-f-]{36}\.stl$/);
    expect(await readFile(join(base, 'private', saved.attachmentPath!))).toEqual(stl.content);
    expect(
      await prisma.auditLog.count({ where: { entity: 'WebQuoteRequest', action: 'received' } }),
    ).toBe(1);
  });

  it('una entrega repetida no la duplica ni guarda otro archivo', async () => {
    const first = await send(data(), stl).expect(201);
    const again = await send(data(), stl).expect(201);
    expect(again.body).toEqual({ id: first.body.id, replayed: true });
    expect(await prisma.webQuoteRequest.count()).toBe(1);
    expect(await stored()).toHaveLength(1);
  });

  it('un adjunto con otro formato no entra', async () => {
    const res = await send(data(), { content: Buffer.from('MZ'), name: 'virus.exe' }).expect(422);
    expect(res.body.details).toMatchObject({ reason: 'INVALID_ATTACHMENT' });
    expect(await prisma.webQuoteRequest.count()).toBe(0);
    expect(await stored()).toHaveLength(0);
  });

  it('un adjunto de más de 20 MB no entra', async () => {
    await send(data(), { content: Buffer.alloc(20 * 1024 * 1024 + 1), name: 'grande.stl' }).expect(
      413,
    );
    expect(await prisma.webQuoteRequest.count()).toBe(0);
    expect(await stored()).toHaveLength(0);
  });

  it('sin archivo también, y sin datos válidos no', async () => {
    const res = await send(data('qr-2')).expect(201);
    expect(
      await prisma.webQuoteRequest.findUniqueOrThrow({ where: { id: res.body.id } }),
    ).toMatchObject({ attachmentPath: null, attachmentName: null });
    await send({ ...data('qr-3'), idea: 'corta' }).expect(400);
  });

  it('sin el alcance quote-requests:write, 403', async () => {
    const other = await newKey(['ping', 'orders:write']);
    await send(data(), stl, other).expect(403);
    expect(await prisma.webQuoteRequest.count()).toBe(0);
  });
});
