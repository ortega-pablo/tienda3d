import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { decOrNull } from '@/common/utils/decimal';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
  /**
   * Markup fallback (en %) cuando ninguna `CategoryPriceTier` cubre la
   * cantidad cotizada. Si es null, una subcategoría hereda del padre.
   */
  baseMarkupPct: number | null;
  productCount: number;
  /** Subcategorías (solo para nodos padre). */
  children?: CategoryDto[];
}

export interface CategoryInput {
  name: string;
  slug?: string | null;
  icon?: string | null;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  notes?: string | null;
  baseMarkupPct?: number | null;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve el árbol completo: padres ordenados por `sortOrder` con sus
   * subcategorías anidadas. Incluye `productCount` por nodo.
   */
  async listTree(filters: { activeOnly?: boolean } = {}): Promise<CategoryDto[]> {
    const where: Prisma.CategoryWhereInput = filters.activeOnly ? { isActive: true } : {};
    const all = await this.prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });

    const byId = new Map(all.map((c) => [c.id, this.toDto(c)]));
    const roots: CategoryDto[] = [];

    for (const c of all) {
      const dto = byId.get(c.id)!;
      if (c.parentId == null) {
        dto.children = [];
        roots.push(dto);
      }
    }
    for (const c of all) {
      if (c.parentId != null) {
        const parent = byId.get(c.parentId);
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(byId.get(c.id)!);
        }
      }
    }
    return roots;
  }

  /** Listado plano (todas las categorías, sin anidar). Útil para selectors. */
  async listFlat(filters: { activeOnly?: boolean } = {}): Promise<CategoryDto[]> {
    const where: Prisma.CategoryWhereInput = filters.activeOnly ? { isActive: true } : {};
    const rows = await this.prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((c) => this.toDto(c));
  }

  async get(id: string): Promise<CategoryDto> {
    const c = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!c) throw new NotFoundException('Categoría inexistente');
    return this.toDto(c);
  }

  async create(input: CategoryInput): Promise<CategoryDto> {
    const slug = (input.slug ?? slugify(input.name)).trim();
    if (!slug) throw new BadRequestException('Slug inválido');

    if (input.parentId) {
      // Validar máx. 2 niveles: el padre no puede tener parentId.
      const parent = await this.prisma.category.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) throw new BadRequestException('Categoría padre inexistente');
      if (parent.parentId !== null) {
        throw new BadRequestException(
          'Solo se permite jerarquía de 2 niveles. La categoría seleccionada como padre ya es subcategoría.',
        );
      }
    }

    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Ya existe una categoría con ese slug');

    const created = await this.prisma.category.create({
      data: {
        name: input.name.trim(),
        slug,
        icon: input.icon ?? null,
        parentId: input.parentId ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        notes: input.notes ?? null,
        baseMarkupPct: input.baseMarkupPct ?? null,
      },
      include: { _count: { select: { products: true } } },
    });
    return this.toDto(created);
  }

  async update(id: string, input: Partial<CategoryInput>): Promise<CategoryDto> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: { children: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('Categoría inexistente');

    // Cambiar parentId está bloqueado: cambia la jerarquía y puede dejar
    // huérfanos. Si el admin necesita reorganizar, que borre y recree.
    if (input.parentId !== undefined && (input.parentId ?? null) !== existing.parentId) {
      throw new BadRequestException(
        'No se puede cambiar la jerarquía de una categoría. Eliminala y recreala bajo el padre correcto.',
      );
    }

    const trimmedSlug = input.slug?.trim();
    if (trimmedSlug && trimmedSlug !== existing.slug) {
      const conflict = await this.prisma.category.findFirst({
        where: { slug: trimmedSlug, NOT: { id } },
      });
      if (conflict) throw new ConflictException('Ya existe una categoría con ese slug');
    }

    const updated = await this.prisma.category
      .update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(trimmedSlug ? { slug: trimmedSlug } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.baseMarkupPct !== undefined
            ? { baseMarkupPct: input.baseMarkupPct }
            : {}),
        },
        include: { _count: { select: { products: true } } },
      })
      .catch(() => {
        throw new NotFoundException('Categoría inexistente');
      });
    return this.toDto(updated);
  }

  async remove(id: string): Promise<void> {
    const c = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: { select: { id: true, name: true } },
        _count: { select: { products: true } },
      },
    });
    if (!c) throw new NotFoundException('Categoría inexistente');

    if (c.children.length > 0) {
      throw new BadRequestException(
        `No se puede eliminar: tiene ${c.children.length} subcategoría(s). Eliminá las subcategorías primero.`,
      );
    }
    if (c._count.products > 0) {
      throw new BadRequestException(
        `No se puede eliminar: tiene ${c._count.products} producto(s) asociado(s). Reasignalos a otra categoría primero o desactivala.`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
  }

  private toDto(
    c: Prisma.CategoryGetPayload<{ include: { _count: { select: { products: true } } } }>,
  ): CategoryDto {
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      parentId: c.parentId,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
      notes: c.notes,
      baseMarkupPct: decOrNull(c.baseMarkupPct),
      productCount: c._count.products,
    };
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
