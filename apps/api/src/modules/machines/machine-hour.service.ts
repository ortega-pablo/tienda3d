import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';

export interface MachineHourBreakdown {
  machineId: string | null;
  machineName: string | null;
  depreciationPerHour: number;
  energyPerHour: number;
  maintenancePerHour: number;
  total: number;
}

/**
 * Replicates the Excel formula:
 *   depreciation = (cost - residual) / useful_life_hours
 *   energy       = (power_w / 1000) * kwh_cost
 *   maintenance  = annual_maintenance / annual_usage_hours
 *   total        = depreciation + energy + maintenance
 */
@Injectable()
export class MachineHourService {
  constructor(private readonly prisma: PrismaService) {}

  async computeActive(): Promise<MachineHourBreakdown> {
    const machine = await this.prisma.machine.findFirst({ where: { isActive: true } });
    if (!machine) {
      return {
        machineId: null,
        machineName: null,
        depreciationPerHour: 0,
        energyPerHour: 0,
        maintenancePerHour: 0,
        total: 0,
      };
    }
    const kwhParam = await this.prisma.globalParam.findUnique({ where: { key: 'kwh_cost' } });
    const kwh = kwhParam ? Number(kwhParam.value) : 0;

    const acquisition = dec(machine.acquisitionCost);
    const residual = dec(machine.residualValue);
    const lifeHours = dec(machine.usefulLifeHours);
    const powerW = dec(machine.powerW);
    const annualMaintenance = dec(machine.annualMaintenance);
    const annualUsageHours = dec(machine.annualUsageHours);

    const depreciation = lifeHours > 0 ? (acquisition - residual) / lifeHours : 0;
    const energy = (powerW / 1000) * kwh;
    const maintenance = annualUsageHours > 0 ? annualMaintenance / annualUsageHours : 0;

    return {
      machineId: machine.id,
      machineName: machine.name,
      depreciationPerHour: depreciation,
      energyPerHour: energy,
      maintenancePerHour: maintenance,
      total: depreciation + energy + maintenance,
    };
  }
}
