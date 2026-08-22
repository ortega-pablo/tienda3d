import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialUnit, PieceScope } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { dec } from '@/common/utils/decimal';
import { MachineHourService } from '../machines/machine-hour.service';
import { CostingCalculator } from './costing.calculator';
import { selectPieces } from './select-pieces';
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
  /**
   * Filtra las piezas del producto por scope. Sin valor → todas las piezas
   * (comportamiento estándar). Los productos tipo llavero costean dos veces:
   * `INDIVIDUAL` (base escala 1-4) y `BATCH` (base de tanda para escalas 5+).
   */
  pieceScope?: PieceScope;
  /**
   * Divide `grams` y `printMinutes` de cada pieza seleccionada por este factor.
   * Se usa con `pieceScope: 'BATCH'` y `divideBy = keychain_batch_size` para
   * obtener el costo de impresión por unidad a partir de una placa de N.
   * Insumos y adicionales NO se dividen (son por unidad).
   */
  divideBy?: number;
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

  async forProduct(productId: string, options: CostingOptions = {}): Promise<CostingResult> {
    // filamentOverrides ya no afecta el costo (el precio vive en el padre);
    // options.pieceScope / options.divideBy sí filtran/dividen las piezas.
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
            suppliers: {
              where: { isCurrent: true },
              orderBy: { registeredAt: 'desc' },
              take: 1,
            },
            parent: {
              include: { suppliers: {
              where: { isCurrent: true },
              orderBy: { registeredAt: 'desc' },
              take: 1,
            } },
            },
          },
        })
      : [];
    const filamentById = new Map(filaments.map((f) => [f.id, f]));

    const allPieces: Array<PieceCostInput & { scope: PieceScope }> = product.pieces.map(
      (piece) => {
        const fil = piece.defaultFilamentId
          ? filamentById.get(piece.defaultFilamentId)
          : undefined;
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
          scope: piece.scope,
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
      },
    );
    // Para productos tipo llavero, filtramos por scope y dividimos la tanda:
    // - base individual → { pieceScope: 'INDIVIDUAL' }
    // - base de tanda/unidad → { pieceScope: 'BATCH', divideBy: keychain_batch_size }
    // Para productos estándar, options viene vacío y se usan todas las piezas.
    const pieces: PieceCostInput[] = selectPieces(allPieces, {
      scope: options.pieceScope,
      divideBy: options.divideBy,
    });

    const materialIds = product.materials.map((m) => m.materialId);
    const materialPrices = materialIds.length
      ? await this.prisma.supplierMaterial.findMany({
          where: { materialId: { in: materialIds }, isCurrent: true },
          // Ascendente a propósito: el Map de abajo indexa por materialId, así
          // que si hubiera más de un precio vigente (ver índice único parcial)
          // gana el último en insertarse, o sea el más reciente.
          orderBy: { registeredAt: 'asc' },
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
   * Dos bases de costo de un producto tipo llavero: la individual (piezas
   * INDIVIDUAL, base de la escala 1-4) y la de tanda por unidad (piezas BATCH
   * ÷ keychain_batch_size, base de las escalas 5+). El panel del editor las
   * muestra lado a lado.
   */
  async forKeychainBases(
    productId: string,
  ): Promise<{ batchSize: number; individual: CostingResult; batchUnit: CostingResult }> {
    const batchSize = await this.loadKeychainBatchSize();
    const [individual, batchUnit] = await Promise.all([
      this.forProduct(productId, { pieceScope: PieceScope.INDIVIDUAL }),
      this.forProduct(productId, { pieceScope: PieceScope.BATCH, divideBy: batchSize }),
    ]);
    return { batchSize, individual, batchUnit };
  }

  private async loadKeychainBatchSize(): Promise<number> {
    const param = await this.prisma.globalParam.findUnique({
      where: { key: 'keychain_batch_size' },
    });
    return param ? Math.max(1, Math.floor(Number(param.value))) : 5;
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
              suppliers: {
              where: { isCurrent: true },
              orderBy: { registeredAt: 'desc' },
              take: 1,
            },
              parent: { include: { suppliers: {
              where: { isCurrent: true },
              orderBy: { registeredAt: 'desc' },
              take: 1,
            } } },
            },
          })
        : [],
      materialIds.length
        ? this.prisma.material.findMany({
            where: { id: { in: materialIds } },
            include: { suppliers: {
              where: { isCurrent: true },
              orderBy: { registeredAt: 'desc' },
              take: 1,
            } },
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
