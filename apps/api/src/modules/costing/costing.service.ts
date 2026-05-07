import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialUnit } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { MachineHourService } from '../machines/machine-hour.service';
import { CostingCalculator } from './costing.calculator';
import type {
  CostingInput,
  CostingResult,
  MaterialCostInput,
  PieceCostInput,
} from './costing.types';

export interface CostingOptions {
  /**
   * Legacy field — kept so callers that still send overrides don't error out.
   * Costs no longer depend on color (price lives on the parent), so this is
   * ignored by forProduct.
   */
  filamentOverrides?: Record<string, string>;
}

export interface AdhocPieceInput {
  name: string;
  grams: number;
  printMinutes: number;
  filamentId: string;
}

export interface AdhocMaterialInput {
  materialId: string;
  quantity: number;
}

export interface AdhocCostingInput {
  description?: string;
  pieces: AdhocPieceInput[];
  materials: AdhocMaterialInput[];
  assemblyMinutes: number;
  managementMinutes: number;
}

/**
 * Orchestrator: pulls product, recipe, prices, machine-hour and global params,
 * then delegates to the pure CostingCalculator.
 */
@Injectable()
export class CostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: CostingCalculator,
    private readonly machineHour: MachineHourService,
  ) {}

  async forProduct(productId: string, _options: CostingOptions = {}): Promise<CostingResult> {
    void _options; // filamentOverrides no longer affect cost (price lives on parent).
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        pieces: { orderBy: { sortOrder: 'asc' } },
        materials: { include: { material: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto inexistente');

    // Load filaments referenced by the pieces. If a piece points to a child
    // (legacy data), we resolve its parent and price the parent — children
    // have no own price under the parent/child model.
    const filamentIds = new Set<string>();
    for (const piece of product.pieces) {
      if (piece.defaultFilamentId) filamentIds.add(piece.defaultFilamentId);
    }

    const filaments = filamentIds.size
      ? await this.prisma.material.findMany({
          where: { id: { in: [...filamentIds] } },
          include: {
            suppliers: { where: { isCurrent: true }, take: 1 },
            parent: {
              include: { suppliers: { where: { isCurrent: true }, take: 1 } },
            },
          },
        })
      : [];
    const filamentById = new Map(filaments.map((f) => [f.id, f]));

    const pieces: PieceCostInput[] = product.pieces.map((piece) => {
      const fil = piece.defaultFilamentId ? filamentById.get(piece.defaultFilamentId) : undefined;
      if (!fil) {
        throw new BadRequestException(
          `La pieza "${piece.name}" no tiene filamento asignado. Asigná un default.`,
        );
      }
      // Resolve to the priced node: the parent (or the row itself if it's already a parent / non-hierarchical).
      const priced = fil.parent ?? fil;
      if (priced.unit !== MaterialUnit.KG) {
        throw new BadRequestException(
          `El filamento "${priced.name}" debe estar en KG para calcular costo por gramo.`,
        );
      }
      const current = priced.suppliers[0];
      return {
        pieceId: piece.id,
        pieceName: piece.name,
        grams: dec(piece.grams),
        printMinutes: dec(piece.printMinutes),
        filamentId: priced.id,
        filamentName: priced.name,
        filamentPricePerKg: current ? dec(current.price) : 0,
        filamentWastePct: dec(priced.wastePct),
        filamentReplenishmentPct: dec(priced.replenishmentMarkupPct),
      };
    });

    const materialIds = product.materials.map((m) => m.materialId);
    const materialPrices = materialIds.length
      ? await this.prisma.supplierMaterial.findMany({
          where: { materialId: { in: materialIds }, isCurrent: true },
        })
      : [];
    const priceById = new Map(materialPrices.map((p) => [p.materialId, p]));

    const materials: MaterialCostInput[] = product.materials.map((row) => {
      const price = priceById.get(row.materialId);
      return {
        materialId: row.material.id,
        materialName: row.material.name,
        unit: row.material.unit,
        quantity: dec(row.quantity),
        unitPrice: price ? dec(price.price) : 0,
        wastePct: dec(row.material.wastePct),
        replenishmentPct: dec(row.material.replenishmentMarkupPct),
      };
    });

    const [hour, params] = await Promise.all([
      this.machineHour.computeActive(),
      this.prisma.globalParam.findMany({
        where: {
          key: {
            in: [
              'labor_hour_cost',
              'contingency_pct',
              'reinvestment_pct',
              'labor_markup_pct',
            ],
          },
        },
      }),
    ]);
    const paramMap = new Map(params.map((p) => [p.key, Number(p.value)]));

    const input: CostingInput = {
      productId: product.id,
      productName: product.name,
      pieces,
      materials,
      assemblyMinutes: dec(product.assemblyMinutes),
      managementMinutes: dec(product.managementMinutes),
      marketingMonthly: dec(product.marketingMonthly),
      estimatedUnitsMonth: dec(product.estimatedUnitsMonth),
      machineHourCost: hour.total,
      laborHourCost: paramMap.get('labor_hour_cost') ?? 0,
      contingencyPct: paramMap.get('contingency_pct') ?? 0,
      reinvestmentPct: paramMap.get('reinvestment_pct') ?? 0,
      laborMarkupPct: paramMap.get('labor_markup_pct') ?? 0,
    };

    return this.calculator.compute(input);
  }

  /**
   * Compute cost for an instant quote (no persisted product).
   * Marketing prorate is intentionally zero since ad-hoc work doesn't share
   * the marketing budget of any specific product.
   */
  async forAdhoc(input: AdhocCostingInput): Promise<CostingResult> {
    const filamentIds = [...new Set(input.pieces.map((p) => p.filamentId).filter(Boolean))];
    const materialIds = [...new Set(input.materials.map((m) => m.materialId))];

    const [filaments, mats, hour, params] = await Promise.all([
      filamentIds.length
        ? this.prisma.material.findMany({
            where: { id: { in: filamentIds } },
            include: {
              suppliers: { where: { isCurrent: true }, take: 1 },
              parent: { include: { suppliers: { where: { isCurrent: true }, take: 1 } } },
            },
          })
        : [],
      materialIds.length
        ? this.prisma.material.findMany({
            where: { id: { in: materialIds } },
            include: { suppliers: { where: { isCurrent: true }, take: 1 } },
          })
        : [],
      this.machineHour.computeActive(),
      this.prisma.globalParam.findMany({
        where: {
          key: {
            in: [
              'labor_hour_cost',
              'contingency_pct',
              'reinvestment_pct',
              'labor_markup_pct',
            ],
          },
        },
      }),
    ]);

    const filamentMap = new Map(filaments.map((f) => [f.id, f]));
    const materialMap = new Map(mats.map((m) => [m.id, m]));
    const paramMap = new Map(params.map((p) => [p.key, Number(p.value)]));

    const pieces: PieceCostInput[] = input.pieces.map((piece, idx) => {
      const fil = filamentMap.get(piece.filamentId);
      if (!fil) {
        throw new BadRequestException(`Filamento inexistente: ${piece.filamentId}`);
      }
      const priced = fil.parent ?? fil;
      if (priced.unit !== MaterialUnit.KG) {
        throw new BadRequestException(`El filamento "${priced.name}" debe estar en KG.`);
      }
      const current = priced.suppliers[0];
      return {
        pieceId: `adhoc-${idx}`,
        pieceName: piece.name || `Pieza ${idx + 1}`,
        grams: piece.grams,
        printMinutes: piece.printMinutes,
        filamentId: priced.id,
        filamentName: priced.name,
        filamentPricePerKg: current ? dec(current.price) : 0,
        filamentWastePct: dec(priced.wastePct),
        filamentReplenishmentPct: dec(priced.replenishmentMarkupPct),
      };
    });

    const materials: MaterialCostInput[] = input.materials.map((m) => {
      const mat = materialMap.get(m.materialId);
      if (!mat) throw new BadRequestException(`Insumo inexistente: ${m.materialId}`);
      const current = mat.suppliers[0];
      return {
        materialId: mat.id,
        materialName: mat.name,
        unit: mat.unit,
        quantity: m.quantity,
        unitPrice: current ? dec(current.price) : 0,
        wastePct: dec(mat.wastePct),
        replenishmentPct: dec(mat.replenishmentMarkupPct),
      };
    });

    const adhocInput: CostingInput = {
      productId: 'adhoc',
      productName: input.description ?? 'Cotización instantánea',
      pieces,
      materials,
      assemblyMinutes: input.assemblyMinutes,
      managementMinutes: input.managementMinutes,
      marketingMonthly: 0,
      estimatedUnitsMonth: 1,
      machineHourCost: hour.total,
      laborHourCost: paramMap.get('labor_hour_cost') ?? 0,
      contingencyPct: paramMap.get('contingency_pct') ?? 0,
      reinvestmentPct: paramMap.get('reinvestment_pct') ?? 0,
      laborMarkupPct: paramMap.get('labor_markup_pct') ?? 0,
    };

    return this.calculator.compute(adhocInput);
  }
}
