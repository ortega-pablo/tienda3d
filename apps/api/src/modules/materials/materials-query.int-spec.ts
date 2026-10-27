import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MaterialType, MaterialUnit } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '@/common/prisma/prisma.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { AppModule } from '@/app.module';
import { truncateAll } from '../../../test/harness';

/**
 * F2·4: `?activeOnly=false` se leía como `true` (`z.coerce.boolean`), así que
 * pedir también los inactivos devolvía solo los activos. Se prueba por HTTP
 * porque el bug estaba en cómo se lee la query, no en el servicio.
 */
describe('[int] GET /materials?activeOnly', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    // Un solo init, como aplicación HTTP (bootTestApp ya inicializa el módulo y
    // un segundo init registra dos veces los cron).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Igual que main.ts: la autenticación es un guard global.
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    await app.init();
    prisma = app.get(PrismaService);
    token = app.get(JwtService).sign({
      sub: 'u-test',
      email: 'test@plastik.local',
      role: 'viewer',
      permissions: ['material:read'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const linea = await prisma.material.create({
      data: { name: 'PLA test', type: MaterialType.FILAMENT, unit: MaterialUnit.KG },
    });
    await prisma.material.createMany({
      data: [
        {
          name: 'PLA test · Negro',
          color: 'Negro',
          type: MaterialType.FILAMENT,
          unit: MaterialUnit.KG,
          parentId: linea.id,
        },
        {
          name: 'PLA test · Frutilla',
          color: 'Frutilla',
          type: MaterialType.FILAMENT,
          unit: MaterialUnit.KG,
          parentId: linea.id,
          isActive: false,
        },
      ],
    });
  });

  const colores = async (query: string): Promise<string[]> => {
    const res = await request(app.getHttpServer())
      .get(`/materials?type=FILAMENT${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body as Array<{ children: Array<{ color: string }> }>)[0]!.children
      .map((c) => c.color)
      .sort();
  };

  it('activeOnly=false devuelve también los colores inactivos', async () => {
    expect(await colores('&activeOnly=false')).toEqual(['Frutilla', 'Negro']);
  });

  it('activeOnly=true devuelve solo los activos', async () => {
    expect(await colores('&activeOnly=true')).toEqual(['Negro']);
  });

  it('un valor que no es booleano es un 400', async () => {
    await request(app.getHttpServer())
      .get('/materials?activeOnly=si')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
