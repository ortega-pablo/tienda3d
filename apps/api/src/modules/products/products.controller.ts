import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ZodValidation } from '@/common/pipes/zod-validation.pipe';
import type { AccessPayload } from '../auth/auth.service';
import { CostingService } from '../costing/costing.service';
import { PricingService } from '../pricing/pricing.service';
import { ProductsService } from './products.service';

/** Las notas internas del producto solo las ven/editan usuarios admin. */
const NOTES_PERMISSION = 'parameter:write';

// Cuando una pieza impresa está cargada, todos sus campos son obligatorios:
// nombre no vacío, gramos > 0, tiempo > 0 y filamento default asignado.
const pieceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'El nombre de la pieza es obligatorio').max(120),
  grams: z.number().positive('Los gramos deben ser mayores a 0'),
  printMinutes: z.number().positive('El tiempo de impresión debe ser mayor a 0'),
  defaultFilamentId: z.string().min(1, 'Asigná un filamento a la pieza'),
  sortOrder: z.number().int().optional(),
  // INDIVIDUAL por default. En productos KEYCHAIN, las piezas de la placa se
  // marcan BATCH; las de un solo producto quedan INDIVIDUAL.
  scope: z.enum(['INDIVIDUAL', 'BATCH']).optional(),
});

const materialLineSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().positive(),
});

const channelLineSchema = z.object({
  channelId: z.string().min(1),
  isEnabled: z.boolean(),
  commissionPct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const inputSchema = z
  .object({
    name: z.string().min(1).max(160),
    // sku no se acepta del input: se auto-genera al crear (PTK-PROD-NNNNNN)
    // y es inmutable después.
    description: z.string().max(2000).nullable().optional(),
    // Notas internas (admin). Se aceptan del input pero el controller las
    // ignora si el usuario no es administrativo.
    notes: z.string().max(4000).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    isActive: z.boolean().optional(),
    // STANDARD por default. KEYCHAIN activa el modelo de escalas de llavero
    // (dos secciones de piezas + grilla global de markups).
    kind: z.enum(['STANDARD', 'KEYCHAIN']).optional(),
    marketingMonthly: z.number().nonnegative(),
    estimatedUnitsMonth: z.number().positive(),
    assemblyMinutes: z.number().nonnegative(),
    managementMinutes: z.number().nonnegative(),
    machineId: z.string().min(1).nullable(),
    // El markup viene 100% de la categoría: el campo es obligatorio.
    categoryId: z.string().min(1, 'Seleccioná una categoría para el producto'),
    pieces: z.array(pieceSchema).min(0),
    materials: z.array(materialLineSchema).min(0),
    channels: z.array(channelLineSchema).optional(),
  })
  // El producto debe tener al menos una pieza impresa o un insumo extra.
  // Sin ninguno de los dos no hay nada que costear.
  .refine((data) => data.pieces.length > 0 || data.materials.length > 0, {
    message: 'El producto debe tener al menos una pieza impresa o un insumo',
    path: ['pieces'],
  })
  // Un producto tipo llavero necesita ambas secciones de piezas: la individual
  // (base de la escala 1-4) y la de tanda (base de las escalas 5+).
  .refine(
    (data) => {
      if (data.kind !== 'KEYCHAIN') return true;
      const scopes = data.pieces.map((p) => p.scope ?? 'INDIVIDUAL');
      return scopes.includes('INDIVIDUAL') && scopes.includes('BATCH');
    },
    {
      message:
        'Un producto tipo llavero necesita al menos una pieza individual y una pieza de tanda',
      path: ['pieces'],
    },
  )
  // Un producto estándar no maneja el concepto de tanda.
  .refine(
    (data) =>
      data.kind === 'KEYCHAIN' || data.pieces.every((p) => (p.scope ?? 'INDIVIDUAL') === 'INDIVIDUAL'),
    {
      message: 'Un producto estándar no puede tener piezas de tanda',
      path: ['pieces'],
    },
  );

const overridesSchema = z.object({
  filamentOverrides: z.record(z.string()).optional(),
});

@UseGuards(PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly costing: CostingService,
    private readonly pricing: PricingService,
  ) {}

  @Permissions('product:read')
  @Get()
  list() {
    return this.products.list();
  }

  @Permissions('product:read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AccessPayload) {
    // Las notas internas solo se devuelven a usuarios administrativos.
    return this.products.get(id, user.permissions.includes(NOTES_PERMISSION));
  }

  @Permissions('product:read')
  @Get(':id/cost')
  cost(@Param('id') id: string) {
    return this.costing.forProduct(id);
  }

  @Permissions('product:read')
  @Post(':id/cost')
  costWithOverrides(
    @Param('id') id: string,
    @Body(ZodValidation(overridesSchema)) body: z.infer<typeof overridesSchema>,
  ) {
    return this.costing.forProduct(id, body);
  }

  @Permissions('product:read')
  @Get(':id/prices')
  prices(@Param('id') id: string) {
    return this.pricing.forProduct(id);
  }

  /** Dos bases de costo (individual + tanda ÷ N) para productos tipo llavero. */
  @Permissions('product:read')
  @Get(':id/keychain-costs')
  keychainCosts(@Param('id') id: string) {
    return this.costing.forKeychainBases(id);
  }

  @Permissions('product:write')
  @Post()
  create(
    @Body(ZodValidation(inputSchema)) body: z.infer<typeof inputSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    const canNotes = user.permissions.includes(NOTES_PERMISSION);
    return this.products.create({ ...body, notes: canNotes ? (body.notes ?? null) : null });
  }

  @Permissions('product:write')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(ZodValidation(inputSchema)) body: z.infer<typeof inputSchema>,
    @CurrentUser() user: AccessPayload,
  ) {
    const canNotes = user.permissions.includes(NOTES_PERMISSION);
    // No-admin: notes = undefined → el service preserva las existentes.
    return this.products.update(id, { ...body, notes: canNotes ? (body.notes ?? null) : undefined });
  }

  @Permissions('product:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.products.remove(id);
  }
}
