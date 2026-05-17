import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface ParameterDto {
  key: string;
  value: string;
  description: string | null;
  updatedAt: Date;
}

const NUMERIC_KEYS = new Set([
  'kwh_cost',
  'labor_hour_cost',
  'design_hour_cost',
  'contingency_pct',
  'reinvestment_pct',
  'unified_regime_pct',
  'direct_sale_commission_pct',
  // Logic C v3 — extra markup over labor and electricity costs.
  'labor_markup_pct',
  'kwh_markup_pct',
]);

/** Percentage params with a hard 0..100 ceiling (block typos like "1500"). */
const PCT_KEYS = new Set([
  'contingency_pct',
  'reinvestment_pct',
  'unified_regime_pct',
  'direct_sale_commission_pct',
  'labor_markup_pct',
  'kwh_markup_pct',
]);

@Injectable()
export class ParametersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ParameterDto[]> {
    return this.prisma.globalParam.findMany({ orderBy: { key: 'asc' } });
  }

  async getNumeric(key: string): Promise<number> {
    const p = await this.prisma.globalParam.findUnique({ where: { key } });
    if (!p) throw new BadRequestException(`Parámetro inexistente: ${key}`);
    const n = Number(p.value);
    if (!Number.isFinite(n)) throw new BadRequestException(`Parámetro no numérico: ${key}`);
    return n;
  }

  async update(values: Record<string, string>, actorId: string): Promise<ParameterDto[]> {
    const entries = Object.entries(values);
    for (const [key, value] of entries) {
      if (NUMERIC_KEYS.has(key)) {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) {
          throw new BadRequestException(`Valor inválido para ${key}`);
        }
        if (PCT_KEYS.has(key) && n > 100) {
          throw new BadRequestException(`${key} no puede superar 100%`);
        }
      }
      if (key === 'currency' && !/^[A-Z]{3}$/.test(value)) {
        throw new BadRequestException('Currency debe ser código ISO de 3 letras');
      }
    }

    const previous = await this.prisma.globalParam.findMany({
      where: { key: { in: entries.map(([k]) => k) } },
    });
    const beforeMap = Object.fromEntries(previous.map((p) => [p.key, p.value]));

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.globalParam.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );

    for (const [key, value] of entries) {
      if (beforeMap[key] !== value) {
        await this.audit.record({
          actorId,
          entity: 'GlobalParam',
          entityId: key,
          action: 'update',
          before: { value: beforeMap[key] ?? null },
          after: { value },
        });
      }
    }
    return this.list();
  }
}
