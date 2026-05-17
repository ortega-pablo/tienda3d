/**
 * CategoryTiersService — pricing por escala a nivel categoría.
 *
 * Cubrimos las dos rutas críticas del modelo nuevo:
 *   1. Validación del set entero (`replaceForCategory` invariants).
 *   2. Herencia subcategoría → padre + fallback a `baseMarkupPct`.
 *
 * El escenario "WHOLESALE con tier piso heredado" del roadmap está testeado
 * con una subcategoría que NO tiene tiers propios para el canal: debe
 * heredar las del padre. Eso garantiza que `mergeTiersBelowFloor` (que vive
 * en customer-pricing.service) recibe el set correcto.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoryTiersService } from './category-tiers.service';

interface FakeCategory {
  id: string;
  parentId: string | null;
  baseMarkupPct: Prisma.Decimal | null;
}
interface FakeTier {
  id: string;
  categoryId: string;
  channelId: string;
  minQty: number;
  maxQty: number | null;
  markupPct: Prisma.Decimal;
  notes: string | null;
}

function makeService(opts: { categories: FakeCategory[]; tiers: FakeTier[] }) {
  const prisma = {
    category: {
      findUnique: jest.fn(async ({ where, select }: { where: { id: string }; select?: any }) => {
        const cat = opts.categories.find((c) => c.id === where.id);
        if (!cat) return null;
        // Si se pidió parent: lo resolvemos del array.
        if (select?.parent) {
          const parent = cat.parentId
            ? opts.categories.find((c) => c.id === cat.parentId)
            : null;
          return { ...cat, parent: parent ?? null };
        }
        return cat;
      }),
    },
    channel: {
      findUnique: jest.fn(async () => ({ id: 'ch_directa', name: 'Venta Directa' })),
    },
    categoryPriceTier: {
      findMany: jest.fn(
        async ({ where }: { where: { categoryId: string; channelId: string } }) => {
          return opts.tiers
            .filter((t) => t.categoryId === where.categoryId && t.channelId === where.channelId)
            .sort((a, b) => a.minQty - b.minQty);
        },
      ),
      deleteMany: jest.fn(async () => undefined),
      createMany: jest.fn(async () => undefined),
    },
    $transaction: jest.fn(async (cb: any) =>
      cb({
        categoryPriceTier: prisma.categoryPriceTier,
      }),
    ),
  } as any;

  const audit = { record: jest.fn() } as any;
  return new CategoryTiersService(prisma, audit);
}

const dec = (n: number) => new Prisma.Decimal(n);

describe('CategoryTiersService — herencia y resolución', () => {
  describe('list()', () => {
    it('devuelve tiers propios cuando la categoría los tiene', async () => {
      const svc = makeService({
        categories: [{ id: 'cat_lamparas', parentId: null, baseMarkupPct: dec(80) }],
        tiers: [
          {
            id: 't1',
            categoryId: 'cat_lamparas',
            channelId: 'ch_directa',
            minQty: 1,
            maxQty: 9,
            markupPct: dec(100),
            notes: null,
          },
        ],
      });
      const result = await svc.list('cat_lamparas', 'ch_directa');
      expect(result.source).toBe('own');
      expect(result.tiers).toHaveLength(1);
      expect(result.tiers[0]!.markupPct).toBe(100);
    });

    it('hereda tiers del padre cuando la subcategoría no tiene propios', async () => {
      // Caso WHOLESALE: subcategoría "Lámparas de mesa" sin tiers propios.
      // El roadmap lo marca como riesgo principal: la matriz del cliente
      // mayorista debe ver los tiers del padre con el piso aplicado.
      const svc = makeService({
        categories: [
          { id: 'cat_lamparas', parentId: null, baseMarkupPct: dec(80) },
          { id: 'cat_mesa', parentId: 'cat_lamparas', baseMarkupPct: null },
        ],
        tiers: [
          {
            id: 't1',
            categoryId: 'cat_lamparas',
            channelId: 'ch_directa',
            minQty: 1,
            maxQty: 4,
            markupPct: dec(100),
            notes: null,
          },
          {
            id: 't2',
            categoryId: 'cat_lamparas',
            channelId: 'ch_directa',
            minQty: 5,
            maxQty: 9,
            markupPct: dec(80),
            notes: null,
          },
          {
            id: 't3',
            categoryId: 'cat_lamparas',
            channelId: 'ch_directa',
            minQty: 10,
            maxQty: null,
            markupPct: dec(60),
            notes: null,
          },
        ],
      });
      const result = await svc.list('cat_mesa', 'ch_directa');
      expect(result.source).toBe('inherited');
      expect(result.inheritedFromCategoryId).toBe('cat_lamparas');
      expect(result.tiers).toHaveLength(3);
      expect(result.tiers.map((t) => t.markupPct)).toEqual([100, 80, 60]);
    });

    it('regla todo-o-nada: subcategoría con UN tier propio descarta los del padre', async () => {
      const svc = makeService({
        categories: [
          { id: 'cat_lamparas', parentId: null, baseMarkupPct: dec(80) },
          { id: 'cat_mesa', parentId: 'cat_lamparas', baseMarkupPct: dec(70) },
        ],
        tiers: [
          {
            id: 't_padre_1',
            categoryId: 'cat_lamparas',
            channelId: 'ch_directa',
            minQty: 1,
            maxQty: null,
            markupPct: dec(100),
            notes: null,
          },
          // Subcategoría tiene su propia escala — pisa COMPLETAMENTE al padre.
          {
            id: 't_hija_1',
            categoryId: 'cat_mesa',
            channelId: 'ch_directa',
            minQty: 1,
            maxQty: null,
            markupPct: dec(50),
            notes: null,
          },
        ],
      });
      const result = await svc.list('cat_mesa', 'ch_directa');
      expect(result.source).toBe('own');
      expect(result.tiers).toHaveLength(1);
      expect(result.tiers[0]!.markupPct).toBe(50);
    });

    it('source = "none" cuando ni la categoría ni el padre tienen tiers', async () => {
      const svc = makeService({
        categories: [{ id: 'cat_huerfana', parentId: null, baseMarkupPct: dec(100) }],
        tiers: [],
      });
      const result = await svc.list('cat_huerfana', 'ch_directa');
      expect(result.source).toBe('none');
      expect(result.tiers).toHaveLength(0);
    });
  });

  describe('resolveMarkup()', () => {
    it('resuelve tier heredada (parent-tier) para subcategoría sin propios', async () => {
      // El caso que más nos importa: cliente WHOLESALE con producto en
      // "Lámparas de mesa" (sin tiers propios) — debe traer el markup de la
      // tier del padre "Lámparas" que cubre la cantidad.
      const svc = makeService({
        categories: [
          { id: 'cat_lamparas', parentId: null, baseMarkupPct: dec(80) },
          { id: 'cat_mesa', parentId: 'cat_lamparas', baseMarkupPct: null },
        ],
        tiers: [
          {
            id: 't1',
            categoryId: 'cat_lamparas',
            channelId: 'ch_directa',
            minQty: 1,
            maxQty: 4,
            markupPct: dec(100),
            notes: null,
          },
          {
            id: 't2',
            categoryId: 'cat_lamparas',
            channelId: 'ch_directa',
            minQty: 5,
            maxQty: null,
            markupPct: dec(60),
            notes: null,
          },
        ],
      });

      const r1 = await svc.resolveMarkup('cat_mesa', 'ch_directa', 3);
      expect(r1.source).toBe('parent-tier');
      expect(r1.markupPct).toBe(100);
      expect(r1.fromCategoryId).toBe('cat_lamparas');

      const r2 = await svc.resolveMarkup('cat_mesa', 'ch_directa', 50);
      expect(r2.source).toBe('parent-tier');
      expect(r2.markupPct).toBe(60);
    });

    it('cae al baseMarkupPct propio si no hay tier que cubra la qty', async () => {
      const svc = makeService({
        categories: [{ id: 'cat_x', parentId: null, baseMarkupPct: dec(80) }],
        tiers: [], // sin escalas → todo cae al base
      });
      const r = await svc.resolveMarkup('cat_x', 'ch_directa', 1);
      expect(r.source).toBe('base');
      expect(r.markupPct).toBe(80);
      expect(r.tier).toBeNull();
    });

    it('cae al baseMarkupPct del padre si el propio es null', async () => {
      const svc = makeService({
        categories: [
          { id: 'cat_lamparas', parentId: null, baseMarkupPct: dec(80) },
          { id: 'cat_mesa', parentId: 'cat_lamparas', baseMarkupPct: null },
        ],
        tiers: [],
      });
      const r = await svc.resolveMarkup('cat_mesa', 'ch_directa', 1);
      expect(r.source).toBe('parent-base');
      expect(r.markupPct).toBe(80);
      expect(r.fromCategoryId).toBe('cat_lamparas');
    });

    it('tira NotFoundException si nadie tiene tiers ni baseMarkupPct', async () => {
      const svc = makeService({
        categories: [
          { id: 'cat_lamparas', parentId: null, baseMarkupPct: null },
          { id: 'cat_mesa', parentId: 'cat_lamparas', baseMarkupPct: null },
        ],
        tiers: [],
      });
      await expect(svc.resolveMarkup('cat_mesa', 'ch_directa', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('validateTierSet() vía replaceForCategory()', () => {
    const baseSetup = {
      categories: [{ id: 'cat_x', parentId: null, baseMarkupPct: dec(100) }],
      tiers: [] as FakeTier[],
    };

    it('rechaza primera tier que no arranca en 1', async () => {
      const svc = makeService(baseSetup);
      await expect(
        svc.replaceForCategory(
          'cat_x',
          'ch_directa',
          [{ minQty: 2, maxQty: 5, markupPct: 80 }],
          'admin_user',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza huecos entre tiers', async () => {
      const svc = makeService(baseSetup);
      await expect(
        svc.replaceForCategory(
          'cat_x',
          'ch_directa',
          [
            { minQty: 1, maxQty: 4, markupPct: 100 },
            { minQty: 10, maxQty: null, markupPct: 80 }, // gap 5-9
          ],
          'admin_user',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza markups que no decrecen', async () => {
      const svc = makeService(baseSetup);
      await expect(
        svc.replaceForCategory(
          'cat_x',
          'ch_directa',
          [
            { minQty: 1, maxQty: 4, markupPct: 80 },
            { minQty: 5, maxQty: null, markupPct: 100 }, // sube, debe ser menor
          ],
          'admin_user',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza tier extra después de una tier abierta', async () => {
      const svc = makeService(baseSetup);
      await expect(
        svc.replaceForCategory(
          'cat_x',
          'ch_directa',
          [
            { minQty: 1, maxQty: null, markupPct: 100 }, // abierta
            { minQty: 2, maxQty: 5, markupPct: 80 }, // imposible
          ],
          'admin_user',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('acepta un set válido y vacío (borrar tiers vuelve a heredar)', async () => {
      const svc = makeService(baseSetup);
      await expect(
        svc.replaceForCategory('cat_x', 'ch_directa', [], 'admin_user'),
      ).resolves.toEqual([]);
    });
  });
});
