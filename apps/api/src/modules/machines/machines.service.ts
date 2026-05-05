import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';

export interface MachineDto {
  id: string;
  name: string;
  isActive: boolean;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeHours: number;
  powerW: number;
  annualMaintenance: number;
  annualUsageHours: number;
  notes: string | null;
}

export interface MachineInput {
  name: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeHours: number;
  powerW: number;
  annualMaintenance: number;
  annualUsageHours: number;
  notes?: string | null;
}

@Injectable()
export class MachinesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<MachineDto[]> {
    const machines = await this.prisma.machine.findMany({ orderBy: { name: 'asc' } });
    return machines.map(this.toDto);
  }

  async get(id: string): Promise<MachineDto> {
    const m = await this.prisma.machine.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Equipo inexistente');
    return this.toDto(m);
  }

  async create(input: MachineInput): Promise<MachineDto> {
    const m = await this.prisma.machine.create({ data: { ...input, isActive: false } });
    return this.toDto(m);
  }

  async update(id: string, input: Partial<MachineInput>): Promise<MachineDto> {
    const m = await this.prisma.machine.update({ where: { id }, data: input }).catch(() => null);
    if (!m) throw new NotFoundException('Equipo inexistente');
    return this.toDto(m);
  }

  /** Activate one machine; deactivate all others atomically. */
  async activate(id: string): Promise<MachineDto> {
    const exists = await this.prisma.machine.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Equipo inexistente');
    await this.prisma.$transaction([
      this.prisma.machine.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      this.prisma.machine.update({ where: { id }, data: { isActive: true } }),
    ]);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const m = await this.prisma.machine.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Equipo inexistente');
    await this.prisma.machine.delete({ where: { id } });
  }

  private toDto(m: {
    id: string;
    name: string;
    isActive: boolean;
    acquisitionCost: import('@prisma/client').Prisma.Decimal;
    residualValue: import('@prisma/client').Prisma.Decimal;
    usefulLifeHours: import('@prisma/client').Prisma.Decimal;
    powerW: import('@prisma/client').Prisma.Decimal;
    annualMaintenance: import('@prisma/client').Prisma.Decimal;
    annualUsageHours: import('@prisma/client').Prisma.Decimal;
    notes: string | null;
  }): MachineDto {
    return {
      id: m.id,
      name: m.name,
      isActive: m.isActive,
      acquisitionCost: dec(m.acquisitionCost),
      residualValue: dec(m.residualValue),
      usefulLifeHours: dec(m.usefulLifeHours),
      powerW: dec(m.powerW),
      annualMaintenance: dec(m.annualMaintenance),
      annualUsageHours: dec(m.annualUsageHours),
      notes: m.notes,
    };
  }
}
