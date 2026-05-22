import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerSuspensionReason, CustomerType, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec, decOrNull } from '@/common/utils/decimal';
import type { CustomerPricingProfile } from '../pricing/pricing.types';

export interface CustomerLite {
  id: string;
  name: string;
  type: CustomerType;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  isActive: boolean;
  hasPortalAccess: boolean;
  skipChannelCommission: boolean;
  skipMarketing: boolean;
  skipRegime: boolean;
  skipReinvestment: boolean;
}

export interface CustomerCategoryCommitmentDto {
  id: string;
  customerId: string;
  categoryId: string;
  categoryName: string;
  /** parentId de la categoría asociada — null si es categoría padre. */
  categoryParentId: string | null;
  minTierQty: number | null;
  monthlyCommitmentQty: number | null;
  isWholesaleSuspended: boolean;
  suspensionReason: string | null;
  suspendedAt: Date | null;
}

export interface CustomerProductOverrideDto {
  customerId: string;
  productId: string;
  productName: string;
  customMarkupPct: number | null;
  notes: string | null;
}

/**
 * Vista completa de un cliente con todas sus relaciones de pricing.
 * Suficiente para construir el `CustomerPricingProfile` que aplica el motor
 * para cualquier producto del catálogo del cliente.
 */
export interface CustomerWithRelations extends CustomerLite {
  categoryCommitments: CustomerCategoryCommitmentDto[];
  productOverrides: CustomerProductOverrideDto[];
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Listado de cotizaciones del cliente (resumen). */
  async listQuotes(customerId: string): Promise<
    Array<{
      id: string;
      code: string;
      type: 'PRODUCT' | 'ADHOC';
      status: string;
      total: number;
      itemCount: number;
      createdAt: Date;
    }>
  > {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente inexistente');
    const quotes = await this.prisma.quote.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { id: true } } },
      take: 100,
    });
    return quotes.map((q) => ({
      id: q.id,
      code: q.code,
      type: q.type,
      status: q.status,
      total: dec(q.total),
      itemCount: q.items.length,
      createdAt: q.createdAt,
    }));
  }

  /** Volúmenes mensuales por categoría (últimos N meses). */
  async listVolumes(
    customerId: string,
    monthsBack = 12,
  ): Promise<
    Array<{
      categoryId: string;
      categoryName: string;
      monthStart: Date;
      unitsSold: number;
      committedQty: number | null;
      unfulfilled: boolean;
    }>
  > {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente inexistente');
    const earliest = new Date();
    earliest.setUTCMonth(earliest.getUTCMonth() - monthsBack);
    earliest.setUTCDate(1);
    earliest.setUTCHours(0, 0, 0, 0);

    const rows = await this.prisma.customerMonthlyVolume.findMany({
      where: { customerId, monthStart: { gte: earliest } },
      include: { category: { select: { name: true } } },
      orderBy: [{ monthStart: 'desc' }, { categoryId: 'asc' }],
    });
    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.category.name,
      monthStart: r.monthStart,
      unitsSold: dec(r.unitsSold),
      committedQty: r.committedQty,
      unfulfilled: r.unfulfilled,
    }));
  }

  async list(filters: { activeOnly?: boolean; type?: CustomerType } = {}): Promise<CustomerLite[]> {
    const where: Prisma.CustomerWhereInput = {};
    if (filters.activeOnly) where.isActive = true;
    if (filters.type) where.type = filters.type;

    const rows = await this.prisma.customer.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map((c) => this.toLite(c));
  }

  async getWithRelations(id: string): Promise<CustomerWithRelations> {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        categoryCommitments: {
          include: { category: { select: { name: true, parentId: true } } },
          orderBy: { createdAt: 'asc' },
        },
        allowedProducts: {
          include: { product: { select: { name: true } } },
        },
      },
    });
    if (!c) throw new NotFoundException('Cliente inexistente');

    return {
      ...this.toLite(c),
      categoryCommitments: c.categoryCommitments.map((cc) => ({
        id: cc.id,
        customerId: cc.customerId,
        categoryId: cc.categoryId,
        categoryName: cc.category.name,
        categoryParentId: cc.category.parentId,
        minTierQty: cc.minTierQty,
        monthlyCommitmentQty: cc.monthlyCommitmentQty,
        isWholesaleSuspended: cc.isWholesaleSuspended,
        suspensionReason: cc.suspensionReason,
        suspendedAt: cc.suspendedAt,
      })),
      productOverrides: c.allowedProducts.map((p) => ({
        customerId: p.customerId,
        productId: p.productId,
        productName: p.product.name,
        customMarkupPct: decOrNull(p.customMarkupPct),
        notes: p.notes,
      })),
    };
  }

  /**
   * Resuelve el `CustomerPricingProfile` aplicado a un producto específico
   * para un cliente.
   *
   * - skipFlags vienen del Customer.
   * - customMarkupPct viene de CustomerProduct si hay override para ese producto (SPECIAL).
   * - minTierQty viene del CustomerCategoryCommitment de la categoría del producto:
   *   - Si la categoría del producto está asociada directamente, usa ese commitment.
   *   - Si no, busca el commitment de la categoría padre.
   *   - Si el commitment está suspendido, ignora el piso (cliente paga al precio público).
   */
  async resolveProductProfile(
    customerId: string,
    productId: string,
  ): Promise<CustomerPricingProfile & { skipMarketing: boolean; skipReinvestment: boolean }> {
    const customer = await this.getWithRelations(customerId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        categoryId: true,
        category: { select: { parentId: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto inexistente');

    // Override por producto (solo SPECIAL).
    const override = customer.productOverrides.find((p) => p.productId === productId);

    // Buscar commitment que aplique: subcategoría primero, padre después.
    let commitment: CustomerCategoryCommitmentDto | undefined;
    if (product.categoryId) {
      commitment = customer.categoryCommitments.find((cc) => cc.categoryId === product.categoryId);
      if (!commitment && product.category?.parentId) {
        commitment = customer.categoryCommitments.find(
          (cc) => cc.categoryId === product.category!.parentId,
        );
      }
    }

    const minTierQty =
      commitment && !commitment.isWholesaleSuspended ? commitment.minTierQty ?? undefined : undefined;

    return {
      skipChannelCommission: customer.skipChannelCommission,
      skipMarketing: customer.skipMarketing,
      skipRegime: customer.skipRegime,
      skipReinvestment: customer.skipReinvestment,
      customMarkupPct: override?.customMarkupPct ?? undefined,
      minTierQty: minTierQty ?? undefined,
    };
  }

  /**
   * Determina si un cliente puede comprar un producto según su tipo:
   *   STANDARD/CONSIGNMENT → todos los activos.
   *   WHOLESALE → solo si la categoría del producto está entre los
   *               commitments del cliente (directa o vía padre).
   *   SPECIAL → solo si está en CustomerProduct.
   */
  async canBuy(customerId: string, productId: string): Promise<boolean> {
    const [customer, product] = await Promise.all([
      this.getWithRelations(customerId),
      this.prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          isActive: true,
          categoryId: true,
          category: { select: { parentId: true } },
        },
      }),
    ]);
    if (!product || !product.isActive) return false;

    switch (customer.type) {
      case CustomerType.STANDARD:
        return true;
      case CustomerType.SPECIAL:
        return customer.productOverrides.some((o) => o.productId === productId);
      case CustomerType.WHOLESALE:
      case CustomerType.CONSIGNMENT: {
        // Tanto mayoristas como consignación filtran por categorías
        // habilitadas. Sin commitments → no ve nada (modo estricto:
        // fuerza al admin a configurar antes de que el cliente compre).
        if (!product.categoryId) return false;
        return customer.categoryCommitments.some(
          (cc) =>
            cc.categoryId === product.categoryId ||
            (product.category?.parentId != null && cc.categoryId === product.category.parentId),
        );
      }
    }
  }

  private toLite(c: {
    id: string;
    name: string;
    type: CustomerType;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    isActive: boolean;
    hasPortalAccess: boolean;
    skipChannelCommission: boolean;
    skipMarketing: boolean;
    skipRegime: boolean;
    skipReinvestment: boolean;
  }): CustomerLite {
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      email: c.email,
      phone: c.phone,
      taxId: c.taxId,
      isActive: c.isActive,
      hasPortalAccess: c.hasPortalAccess,
      skipChannelCommission: c.skipChannelCommission,
      skipMarketing: c.skipMarketing,
      skipRegime: c.skipRegime,
      skipReinvestment: c.skipReinvestment,
    };
  }
}

// Para evitar warnings de unused import en caso de ajuste de tipos.
void dec;

// ----------------------------------------------------------------------------
// Inputs (extiendo el service con CRUD completo).
// ----------------------------------------------------------------------------

export interface CustomerInput {
  name: string;
  type?: CustomerType;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  notes?: string | null;
  isActive?: boolean;
  skipChannelCommission?: boolean;
  skipMarketing?: boolean;
  skipRegime?: boolean;
  skipReinvestment?: boolean;
  hasPortalAccess?: boolean;
}

export interface CategoryCommitmentInput {
  categoryId: string;
  minTierQty?: number | null;
  monthlyCommitmentQty?: number | null;
  notes?: string | null;
}

export interface CustomerProductInput {
  productId: string;
  customMarkupPct?: number | null;
  notes?: string | null;
}

@Injectable()
export class CustomersWriteService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CustomerInput): Promise<{ id: string }> {
    if (input.email) {
      const exists = await this.prisma.customer.findUnique({ where: { email: input.email } });
      if (exists) throw new ConflictException('Ya existe un cliente con ese email');
    }

    // Defaults sugeridos por preset (el front los puede pisar manualmente).
    const presetFlags = computePresetFlags(input.type ?? CustomerType.WHOLESALE);

    const created = await this.prisma.customer.create({
      data: {
        name: input.name.trim(),
        type: input.type ?? CustomerType.WHOLESALE,
        email: input.email ?? null,
        phone: input.phone ?? null,
        taxId: input.taxId ?? null,
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
        skipChannelCommission: input.skipChannelCommission ?? presetFlags.skipChannelCommission,
        skipMarketing: input.skipMarketing ?? presetFlags.skipMarketing,
        skipRegime: input.skipRegime ?? presetFlags.skipRegime,
        skipReinvestment: input.skipReinvestment ?? presetFlags.skipReinvestment,
        hasPortalAccess: input.hasPortalAccess ?? false,
      },
    });
    return { id: created.id };
  }

  async update(id: string, input: Partial<CustomerInput>): Promise<{ id: string }> {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cliente inexistente');

    if (input.email && input.email !== existing.email) {
      const conflict = await this.prisma.customer.findFirst({
        where: { email: input.email, NOT: { id } },
      });
      if (conflict) throw new ConflictException('Ya existe un cliente con ese email');
    }
    await this.prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.skipChannelCommission !== undefined
          ? { skipChannelCommission: input.skipChannelCommission }
          : {}),
        ...(input.skipMarketing !== undefined ? { skipMarketing: input.skipMarketing } : {}),
        ...(input.skipRegime !== undefined ? { skipRegime: input.skipRegime } : {}),
        ...(input.skipReinvestment !== undefined
          ? { skipReinvestment: input.skipReinvestment }
          : {}),
        ...(input.hasPortalAccess !== undefined ? { hasPortalAccess: input.hasPortalAccess } : {}),
      },
    });
    return { id };
  }

  async remove(id: string): Promise<void> {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { quotes: true } } },
    });
    if (!c) throw new NotFoundException('Cliente inexistente');

    // Si tiene cotizaciones históricas → soft delete (preserva snapshots).
    if (c._count.quotes > 0) {
      await this.prisma.customer.update({ where: { id }, data: { isActive: false } });
      return;
    }
    await this.prisma.customer.delete({ where: { id } });
  }

  // ---- Commitments por categoría ----

  async upsertCommitment(
    customerId: string,
    input: CategoryCommitmentInput,
  ): Promise<{ id: string }> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente inexistente');

    // Commitments aplican a WHOLESALE (con piso de tier + compromiso mensual)
    // y a CONSIGNMENT (solo on/off por categoría — los campos wholesale se
    // ignoran). STANDARD es walk-in y SPECIAL filtra por productos, no por
    // categorías.
    if (
      customer.type !== CustomerType.WHOLESALE &&
      customer.type !== CustomerType.CONSIGNMENT
    ) {
      throw new BadRequestException(
        'Las categorías habilitadas solo aplican a clientes WHOLESALE o CONSIGNMENT',
      );
    }

    const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new BadRequestException('Categoría inexistente');

    if (input.minTierQty != null && input.minTierQty < 1) {
      throw new BadRequestException('minTierQty debe ser ≥ 1');
    }
    if (input.monthlyCommitmentQty != null && input.monthlyCommitmentQty < 1) {
      throw new BadRequestException('monthlyCommitmentQty debe ser ≥ 1');
    }

    // Para CONSIGNMENT los campos wholesale-only siempre van a null —
    // garantía server-side aunque el frontend los envíe por error.
    const isWholesale = customer.type === CustomerType.WHOLESALE;
    const minTierQty = isWholesale ? input.minTierQty ?? null : null;
    const monthlyCommitmentQty = isWholesale ? input.monthlyCommitmentQty ?? null : null;

    const row = await this.prisma.customerCategoryCommitment.upsert({
      where: { customerId_categoryId: { customerId, categoryId: input.categoryId } },
      create: {
        customerId,
        categoryId: input.categoryId,
        minTierQty,
        monthlyCommitmentQty,
        notes: input.notes ?? null,
      },
      update: {
        ...(isWholesale && input.minTierQty !== undefined
          ? { minTierQty: input.minTierQty }
          : !isWholesale
            ? { minTierQty: null }
            : {}),
        ...(isWholesale && input.monthlyCommitmentQty !== undefined
          ? { monthlyCommitmentQty: input.monthlyCommitmentQty }
          : !isWholesale
            ? { monthlyCommitmentQty: null }
            : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return { id: row.id };
  }

  async removeCommitment(customerId: string, commitmentId: string): Promise<void> {
    const row = await this.prisma.customerCategoryCommitment.findUnique({
      where: { id: commitmentId },
    });
    if (!row || row.customerId !== customerId) {
      throw new NotFoundException('Compromiso inexistente');
    }
    await this.prisma.customerCategoryCommitment.delete({ where: { id: commitmentId } });
  }

  /** Cambia el estado de suspensión manual de un commitment (admin only). */
  async toggleSuspension(
    customerId: string,
    commitmentId: string,
    suspend: boolean,
  ): Promise<{ id: string; isWholesaleSuspended: boolean }> {
    const row = await this.prisma.customerCategoryCommitment.findUnique({
      where: { id: commitmentId },
    });
    if (!row || row.customerId !== customerId) {
      throw new NotFoundException('Compromiso inexistente');
    }

    const updated = await this.prisma.customerCategoryCommitment.update({
      where: { id: commitmentId },
      data: suspend
        ? {
            isWholesaleSuspended: true,
            suspensionReason: CustomerSuspensionReason.MANUAL_ADMIN,
            suspendedAt: new Date(),
          }
        : {
            isWholesaleSuspended: false,
            suspensionReason: null,
            suspendedAt: null,
          },
    });
    return { id: updated.id, isWholesaleSuspended: updated.isWholesaleSuspended };
  }

  // ---- Productos asignados (SPECIAL) ----

  async upsertProduct(customerId: string, input: CustomerProductInput): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente inexistente');
    const product = await this.prisma.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new BadRequestException('Producto inexistente');

    await this.prisma.customerProduct.upsert({
      where: {
        customerId_productId: { customerId, productId: input.productId },
      },
      create: {
        customerId,
        productId: input.productId,
        customMarkupPct: input.customMarkupPct ?? null,
        notes: input.notes ?? null,
      },
      update: {
        ...(input.customMarkupPct !== undefined
          ? { customMarkupPct: input.customMarkupPct }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
  }

  async removeProduct(customerId: string, productId: string): Promise<void> {
    const row = await this.prisma.customerProduct.findUnique({
      where: { customerId_productId: { customerId, productId } },
    });
    if (!row) throw new NotFoundException('Producto no asignado a este cliente');
    await this.prisma.customerProduct.delete({
      where: { customerId_productId: { customerId, productId } },
    });
  }
}

function computePresetFlags(type: CustomerType): {
  skipChannelCommission: boolean;
  skipMarketing: boolean;
  skipRegime: boolean;
  skipReinvestment: boolean;
} {
  switch (type) {
    case CustomerType.CONSIGNMENT:
      return {
        skipChannelCommission: true,
        skipMarketing: true,
        skipRegime: false,
        skipReinvestment: false,
      };
    case CustomerType.SPECIAL:
    case CustomerType.WHOLESALE:
    case CustomerType.STANDARD:
    default:
      return {
        skipChannelCommission: false,
        skipMarketing: false,
        skipRegime: false,
        skipReinvestment: false,
      };
  }
}
