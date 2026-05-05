import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface SupplierDto {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  materialCount: number;
}

export interface SupplierInput {
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SupplierDto[]> {
    const items = await this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { prices: true } } },
    });
    return items.map((s) => ({
      id: s.id,
      name: s.name,
      contact: s.contact,
      phone: s.phone,
      email: s.email,
      notes: s.notes,
      isActive: s.isActive,
      materialCount: s._count.prices,
    }));
  }

  async create(input: SupplierInput): Promise<SupplierDto> {
    const supplier = await this.prisma.supplier.create({
      data: {
        name: input.name,
        contact: input.contact ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
      },
    });
    return { ...supplier, materialCount: 0 };
  }

  async update(id: string, input: Partial<SupplierInput>): Promise<SupplierDto> {
    const supplier = await this.prisma.supplier
      .update({ where: { id }, data: input })
      .catch(() => null);
    if (!supplier) throw new NotFoundException('Proveedor inexistente');
    const list = await this.list();
    return list.find((s) => s.id === id) as SupplierDto;
  }

  async remove(id: string): Promise<void> {
    const used = await this.prisma.supplierMaterial.count({ where: { supplierId: id } });
    if (used > 0) {
      // Soft-delete to preserve historical prices.
      await this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
      return;
    }
    await this.prisma.supplier.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Proveedor inexistente');
    });
  }
}
