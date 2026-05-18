import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/common/prisma/prisma.service';

/** Id estable del único registro de defaults (singleton). */
const SINGLETON_ID = 'keychain_defaults_singleton';

export interface KeychainDefaultsDto {
  pieceName: string;
  pieceGrams: number;
  piecePrintMinutes: number;
  pieceFilamentId: string | null;
  assemblyMinutes: number;
  managementMinutes: number;
  materials: Array<{
    materialId: string;
    quantity: number;
    sortOrder: number;
  }>;
  updatedAt: Date;
}

export interface KeychainDefaultsInput {
  pieceName: string;
  pieceGrams: number;
  piecePrintMinutes: number;
  pieceFilamentId: string | null;
  assemblyMinutes: number;
  managementMinutes: number;
  materials: Array<{
    materialId: string;
    quantity: number;
  }>;
}

/**
 * Service para los valores precargados del form de cotización de
 * llaveros. Es una **fila singleton** con id estable
 * `keychain_defaults_singleton` (garantizada por seed + migración).
 *
 * Los valores siguen la convención de batch del flujo keychain: se
 * cargan como totales para `keychain_batch_size` llaveros, no per-unidad.
 * El form del vendedor los muestra como punto de partida — puede
 * editarlos, quitarlos o agregar más.
 *
 * El `update` reemplaza atómicamente todos los campos + el set de
 * materiales default. Pasar `materials: []` deja la lista vacía.
 */
@Injectable()
export class KeychainDefaultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<KeychainDefaultsDto> {
    // Defensive: si por alguna razón la fila no existe (DB recién
    // restaurada sin pasar por el seed/migración), la creamos vacía.
    const row = await this.prisma.keychainDefaults.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: {
        id: SINGLETON_ID,
        pieceName: 'Llavero',
        pieceGrams: 0,
        piecePrintMinutes: 0,
        assemblyMinutes: 0,
        managementMinutes: 0,
      },
      include: {
        materials: { orderBy: { sortOrder: 'asc' } },
      },
    });
    return this.toDto(row);
  }

  async update(input: KeychainDefaultsInput, actorId: string): Promise<KeychainDefaultsDto> {
    if (!input.pieceName.trim()) {
      throw new BadRequestException('El nombre de la pieza es obligatorio');
    }
    if (input.pieceGrams < 0 || input.piecePrintMinutes < 0) {
      throw new BadRequestException('Gramos y minutos de impresión deben ser ≥ 0');
    }
    if (input.assemblyMinutes < 0 || input.managementMinutes < 0) {
      throw new BadRequestException('Tiempos deben ser ≥ 0');
    }
    // Validamos que cada material aparezca una sola vez en el set.
    const seenIds = new Set<string>();
    for (const m of input.materials) {
      if (seenIds.has(m.materialId)) {
        throw new BadRequestException(
          `El insumo ${m.materialId} aparece duplicado — agrupá las cantidades en una sola fila.`,
        );
      }
      seenIds.add(m.materialId);
      if (m.quantity <= 0) {
        throw new BadRequestException('La cantidad de cada insumo debe ser > 0');
      }
    }
    if (input.pieceFilamentId) {
      const filament = await this.prisma.material.findUnique({
        where: { id: input.pieceFilamentId },
        select: { id: true },
      });
      if (!filament) {
        throw new BadRequestException('Filamento default inexistente');
      }
    }
    // Validamos que todos los insumos del set existan (catch temprano de
    // referencias rotas).
    if (input.materials.length > 0) {
      const materialIds = input.materials.map((m) => m.materialId);
      const found = await this.prisma.material.findMany({
        where: { id: { in: materialIds } },
        select: { id: true },
      });
      if (found.length !== materialIds.length) {
        throw new BadRequestException('Uno o más insumos default no existen');
      }
    }

    const before = await this.get();

    await this.prisma.$transaction(async (tx) => {
      await tx.keychainDefaults.upsert({
        where: { id: SINGLETON_ID },
        update: {
          pieceName: input.pieceName.trim(),
          pieceGrams: new Prisma.Decimal(input.pieceGrams),
          piecePrintMinutes: new Prisma.Decimal(input.piecePrintMinutes),
          pieceFilamentId: input.pieceFilamentId,
          assemblyMinutes: new Prisma.Decimal(input.assemblyMinutes),
          managementMinutes: new Prisma.Decimal(input.managementMinutes),
        },
        create: {
          id: SINGLETON_ID,
          pieceName: input.pieceName.trim(),
          pieceGrams: new Prisma.Decimal(input.pieceGrams),
          piecePrintMinutes: new Prisma.Decimal(input.piecePrintMinutes),
          pieceFilamentId: input.pieceFilamentId,
          assemblyMinutes: new Prisma.Decimal(input.assemblyMinutes),
          managementMinutes: new Prisma.Decimal(input.managementMinutes),
        },
      });
      await tx.keychainDefaultMaterial.deleteMany({
        where: { defaultsId: SINGLETON_ID },
      });
      if (input.materials.length > 0) {
        await tx.keychainDefaultMaterial.createMany({
          data: input.materials.map((m, idx) => ({
            defaultsId: SINGLETON_ID,
            materialId: m.materialId,
            quantity: new Prisma.Decimal(m.quantity),
            sortOrder: idx,
          })),
        });
      }
    });

    const after = await this.get();
    await this.audit.record({
      actorId,
      entity: 'KeychainDefaults',
      entityId: SINGLETON_ID,
      action: 'update',
      before: { ...before, updatedAt: before.updatedAt.toISOString() },
      after: { ...after, updatedAt: after.updatedAt.toISOString() },
    });
    return after;
  }

  private toDto(
    row: Prisma.KeychainDefaultsGetPayload<{ include: { materials: true } }>,
  ): KeychainDefaultsDto {
    return {
      pieceName: row.pieceName,
      pieceGrams: Number(row.pieceGrams),
      piecePrintMinutes: Number(row.piecePrintMinutes),
      pieceFilamentId: row.pieceFilamentId,
      assemblyMinutes: Number(row.assemblyMinutes),
      managementMinutes: Number(row.managementMinutes),
      materials: row.materials
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => ({
          materialId: m.materialId,
          quantity: Number(m.quantity),
          sortOrder: m.sortOrder,
        })),
      updatedAt: row.updatedAt,
    };
  }
}
