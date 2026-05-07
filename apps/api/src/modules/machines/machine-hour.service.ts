import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';

export interface MachineHourBreakdown {
  machineId: string | null;
  machineName: string | null;
  depreciationPerHour: number;
  /** Energía cruda (sin markup). */
  energyPerHourRaw: number;
  /** Markup aplicado sobre la energía (Logic C v3, default 5 %). */
  energyMarkupPct: number;
  /** Energía con markup — la que entra en el costo total. */
  energyPerHour: number;
  maintenancePerHour: number;
  total: number;
}

/**
 * Replicates the Excel formula plus Logic C v3 electricity markup:
 *   depreciation     = (cost - residual) / useful_life_hours
 *   energy_raw       = (power_w / 1000) * kwh_cost
 *   energy_per_hour  = energy_raw * (1 + kwh_markup_pct/100)
 *   maintenance      = annual_maintenance / annual_usage_hours
 *   total            = depreciation + energy_per_hour + maintenance
 *
 * The markup is folded into the hour rate so callers see it as part of the
 * machine cost — the calculator doesn't need to know about it separately.
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
        energyPerHourRaw: 0,
        energyMarkupPct: 0,
        energyPerHour: 0,
        maintenancePerHour: 0,
        total: 0,
      };
    }
    const params = await this.prisma.globalParam.findMany({
      where: { key: { in: ['kwh_cost', 'kwh_markup_pct'] } },
    });
    const paramMap = new Map(params.map((p) => [p.key, Number(p.value)]));
    const kwh = paramMap.get('kwh_cost') ?? 0;
    const kwhMarkupPct = paramMap.get('kwh_markup_pct') ?? 0;

    const acquisition = dec(machine.acquisitionCost);
    const residual = dec(machine.residualValue);
    const lifeHours = dec(machine.usefulLifeHours);
    const powerW = dec(machine.powerW);
    const annualMaintenance = dec(machine.annualMaintenance);
    const annualUsageHours = dec(machine.annualUsageHours);

    const depreciation = lifeHours > 0 ? (acquisition - residual) / lifeHours : 0;
    const energyRaw = (powerW / 1000) * kwh;
    const energy = energyRaw * (1 + kwhMarkupPct / 100);
    const maintenance = annualUsageHours > 0 ? annualMaintenance / annualUsageHours : 0;

    return {
      machineId: machine.id,
      machineName: machine.name,
      depreciationPerHour: depreciation,
      energyPerHourRaw: energyRaw,
      energyMarkupPct: kwhMarkupPct,
      energyPerHour: energy,
      maintenancePerHour: maintenance,
      total: depreciation + energy + maintenance,
    };
  }
}
