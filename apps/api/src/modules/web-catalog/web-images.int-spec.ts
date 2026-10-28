import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import type { WebProductDto } from '@tienda3d/shared';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { AppModule } from '@/app.module';
import { MaterialType, MaterialUnit } from '@prisma/client';
import { WebColorOptionsService } from './web-color-options.service';
import { WebProductsService } from './web-products.service';
import { seedFixtures, truncateAll, type Fixtures } from '../../../test/harness';

/**
 * F6·2: el admin sube, ordena y borra las fotos de una publicación. Por HTTP,
 * porque los límites de tamaño y cantidad son de multer.
 */
describe('[int] Fotos de la tienda online', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let token: string;
  let fx: Fixtures;
  let pubId: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'web-images-'));
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

  beforeEach(async () => {
    await truncateAll(prisma);
    await rm(join(base, 'media'), { recursive: true, force: true });
    fx = await seedFixtures(prisma);
    token = app.get(JwtService).sign({
      sub: fx.userId,
      email: 'test@plastik.local',
      role: 'admin',
      permissions: ['ecommerce:read', 'ecommerce:write'],
    });
    pubId = (await app.get(WebProductsService).create({ name: 'Maceta Geo' }, fx.userId)).id;
  });

  const jpg = (width = 3000, height = 1500) =>
    sharp({ create: { width, height, channels: 3, background: '#36c' } })
      .withExif({ IFD0: { Artist: 'Taller' } })
      .jpeg()
      .toBuffer();
  const subir = (...files: Array<[Buffer, string]>) => {
    let req = request(app.getHttpServer())
      .post(`/web-catalog/products/${pubId}/images`)
      .set('Authorization', `Bearer ${token}`);
    for (const [data, filename] of files) req = req.attach('files', data, { filename });
    return req;
  };
  const archivos = async () => {
    try {
      return await readdir(join(base, 'media', 'catalog', pubId));
    } catch {
      return [];
    }
  };
  const patch = (imageId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/web-catalog/products/${pubId}/images/${imageId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('un JPG real se guarda como WebP de 2000 px, sin EXIF, en el volumen', async () => {
    // Ruido para que pese varios MB: el límite JSON de 1 MB no aplica a la subida.
    const pesado = await sharp({
      create: {
        width: 3000,
        height: 1500,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .withExif({ IFD0: { Artist: 'Taller' } })
      .jpeg({ quality: 95 })
      .toBuffer();
    expect(pesado.length).toBeGreaterThan(2 * 1024 * 1024);

    const res = await subir([pesado, 'lampara.jpg']).expect(201);
    const [imagen] = (res.body as WebProductDto).images;

    expect(imagen).toMatchObject({ width: 2000, height: 1000, position: 0 });
    expect(imagen!.path).toMatch(new RegExp(`^catalog/${pubId}/[0-9a-f-]{36}\\.webp$`));
    const guardado = await readFile(join(base, 'media', imagen!.path));
    const meta = await sharp(guardado).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('un .jpg que en realidad es texto se rechaza y no deja nada', async () => {
    const res = await subir(
      [await jpg(400, 300), 'buena.jpg'],
      [Buffer.from('no soy una foto'), 'trucha.jpg'],
    ).expect(400);
    expect((res.body as { message: string }).message).toMatch(/"trucha.jpg" no es una foto/);
    expect(await prisma.webImage.count()).toBe(0);
    expect(await archivos()).toEqual([]);
  });

  it('un archivo de 16 MB se rechaza', async () => {
    const enorme = Buffer.concat([await jpg(100, 100), Buffer.alloc(16 * 1024 * 1024)]);
    const res = await subir([enorme, 'enorme.jpg']).catch((e: { response?: request.Response }) => {
      // Si el servidor corta la subida antes de leerla entera, queda la respuesta en el error.
      if (!e.response) throw e;
      return e.response;
    });
    expect(res.status).toBe(413);
    expect(await prisma.webImage.count()).toBe(0);
  });

  it('ordena: mover la tercera al principio renumera la galería', async () => {
    const res = await subir(
      [await jpg(200, 100), 'a.jpg'],
      [await jpg(200, 100), 'b.jpg'],
      [await jpg(200, 100), 'c.jpg'],
    ).expect(201);
    const [a, b, c] = (res.body as WebProductDto).images;

    const movida = await patch(c!.id, { position: 0, alt: 'Vista lateral' }).expect(200);
    const images = (movida.body as WebProductDto).images;
    expect(images.map((i) => [i.id, i.position])).toEqual([
      [c!.id, 0],
      [a!.id, 1],
      [b!.id, 2],
    ]);
    expect(images[0]!.alt).toBe('Vista lateral');
  });

  it('una foto de color tiene que ser de un color ofrecido', async () => {
    const res = await subir([await jpg(200, 100), 'negra.jpg']).expect(201);
    const [imagen] = (res.body as WebProductDto).images;
    const negro = await prisma.material.create({
      data: {
        name: 'PLA Negro',
        color: 'Negro',
        type: MaterialType.FILAMENT,
        unit: MaterialUnit.KG,
        parentId: fx.filamentId,
      },
    });

    await patch(imagen!.id, { colorMaterialId: negro.id }).expect(400);

    await app
      .get(WebProductsService)
      .setMembers(pubId, [{ productId: fx.productId, valueLabel: '' }], fx.userId);
    await app
      .get(WebColorOptionsService)
      .set(
        pubId,
        [{ label: 'Color', filamentLineId: fx.filamentId, colorIds: [negro.id] }],
        fx.userId,
      );
    const ok = await patch(imagen!.id, { colorMaterialId: negro.id }).expect(200);
    expect((ok.body as WebProductDto).images[0]!.colorMaterialId).toBe(negro.id);
  });

  it('borrar saca la fila y el archivo', async () => {
    const res = await subir([await jpg(200, 100), 'a.jpg']).expect(201);
    const [imagen] = (res.body as WebProductDto).images;
    expect(await archivos()).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/web-catalog/products/${pubId}/images/${imagen!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(await prisma.webImage.count()).toBe(0);
    expect(await archivos()).toEqual([]);
  });

  it('una foto de otra publicación no se toca desde esta', async () => {
    const res = await subir([await jpg(200, 100), 'a.jpg']).expect(201);
    const [imagen] = (res.body as WebProductDto).images;
    const otra = await app.get(WebProductsService).create({ name: 'Otra' }, fx.userId);

    await request(app.getHttpServer())
      .delete(`/web-catalog/products/${otra.id}/images/${imagen!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(await prisma.webImage.count()).toBe(1);
  });

  describe('GET /web-catalog/media/* (F6·3)', () => {
    const media = (path: string, auth = token) =>
      request(app.getHttpServer())
        .get(`/web-catalog/media/${path}`)
        .set('Authorization', `Bearer ${auth}`);

    it('sirve la foto subida al panel, con caché privada', async () => {
      const res = await subir([await jpg(200, 100), 'a.jpg']).expect(201);
      const [imagen] = (res.body as WebProductDto).images;

      const foto = await media(imagen!.path)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(foto.headers['content-type']).toBe('image/webp');
      expect(foto.headers['cache-control']).toMatch(/^private/);
      expect(foto.body).toEqual(await readFile(join(base, 'media', imagen!.path)));
    });

    it('no sale del volumen ni sirve otra cosa que fotos', async () => {
      await media('catalog/..%2F..%2F..%2Fetc%2Fpasswd.webp').expect((r) =>
        expect([400, 404]).toContain(r.status),
      );
      await media('catalog/no-existe.webp').expect(404);
      await media('catalog/datos.json').expect(404);
    });

    it('pide ecommerce:read', async () => {
      const res = await subir([await jpg(200, 100), 'a.jpg']).expect(201);
      const [imagen] = (res.body as WebProductDto).images;
      const sinPermiso = app
        .get(JwtService)
        .sign({ sub: fx.userId, email: 'x@plastik.local', role: 'operator', permissions: [] });

      await media(imagen!.path, sinPermiso).expect(403);
      await request(app.getHttpServer()).get(`/web-catalog/media/${imagen!.path}`).expect(401);
    });
  });
});
