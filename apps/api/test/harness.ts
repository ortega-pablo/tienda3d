import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { MaterialType, MaterialUnit, ChannelKind, TaxMode } from '@prisma/client';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Levanta la app REAL (AppModule completo, DI incluida) contra la base de
 * tests. No se mockea nada: el punto de esta suite es que las transacciones,
 * los índices y las constraints se ejerciten de verdad.
 */
export async function bootTestApp(): Promise<{
  moduleRef: TestingModule;
  prisma: PrismaService;
  close: () => Promise<void>;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await moduleRef.init();
  const prisma = moduleRef.get(PrismaService);
  return {
    moduleRef,
    prisma,
    close: async () => {
      await moduleRef.close();
    },
  };
}

/** Tablas que se limpian entre tests, en orden irrelevante (CASCADE). */
const TABLES = [
  'audit_logs',
  'stock_movements',
  'production_orders',
  'quote_items',
  'quotes',
  'customer_monthly_volumes',
  'customer_category_commitments',
  'customer_products',
  'customers',
  'product_channels',
  'product_materials',
  'product_pieces',
  'products',
  'category_price_tiers',
  'categories',
  'channels',
  'supplier_materials',
  'materials',
  'suppliers',
  'machines',
  'refresh_tokens',
  'users',
  'role_permissions',
  'roles',
  'permissions',
  'global_params',
  'keychain_scale_tiers',
  'document_counters',
];

export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}

export interface Fixtures {
  userId: string;
  channelId: string;
  categoryId: string;
  productId: string;
  filamentId: string;
  materialId: string;
}

/**
 * Datos mínimos para cotizar y producir: un usuario, una máquina activa, los
 * parámetros globales que lee el costeo, un filamento con precio vigente, un
 * insumo, una categoría con markup y un producto con receta.
 */
export async function seedFixtures(prisma: PrismaService): Promise<Fixtures> {
  const role = await prisma.role.create({ data: { name: 'admin-test', isSystem: false } });
  const user = await prisma.user.create({
    data: { email: 'test@plastik.local', name: 'Test', passwordHash: 'x', roleId: role.id },
  });

  await prisma.machine.create({
    data: {
      name: 'A1 test',
      isActive: true,
      acquisitionCost: 1_400_000,
      residualValue: 350_000,
      usefulLifeHours: 6_000,
      powerW: 260,
      annualMaintenance: 80_000,
      annualUsageHours: 2_000,
    },
  });

  for (const [key, value] of [
    ['kwh_cost', '303.98'],
    ['labor_hour_cost', '5000'],
    ['design_hour_cost', '7500'],
    ['contingency_pct', '5'],
    ['reinvestment_pct', '10'],
    ['unified_regime_pct', '4'],
    ['direct_sale_commission_pct', '6.5'],
    ['labor_markup_pct', '5'],
    ['kwh_markup_pct', '5'],
    ['price_rounding_step', '50'],
    ['iva_pct', '21'],
    ['keychain_batch_size', '5'],
    ['adhoc_default_markup_pct', '60'],
  ] as const) {
    await prisma.globalParam.create({ data: { key, value } });
  }

  const supplier = await prisma.supplier.create({ data: { name: 'Proveedor test' } });

  const filament = await prisma.material.create({
    data: {
      name: 'PLA test',
      type: MaterialType.FILAMENT,
      unit: MaterialUnit.KG,
      wastePct: 5,
      replenishmentMarkupPct: 15,
      currentStock: 10,
    },
  });
  await prisma.supplierMaterial.create({
    data: { materialId: filament.id, supplierId: supplier.id, price: 20_000, isCurrent: true },
  });

  const material = await prisma.material.create({
    data: {
      name: 'Anilla test',
      type: MaterialType.HARDWARE,
      unit: MaterialUnit.UNIT,
      wastePct: 0,
      replenishmentMarkupPct: 15,
      currentStock: 100,
    },
  });
  await prisma.supplierMaterial.create({
    data: { materialId: material.id, supplierId: supplier.id, price: 50, isCurrent: true },
  });

  const channel = await prisma.channel.create({
    data: {
      name: 'Venta Directa test',
      slug: 'directa-test',
      kind: ChannelKind.DIRECT_SALE,
      taxMode: TaxMode.SIMPLE,
      commissionPct: 6.5,
      unifiedRegimePct: 4,
    },
  });

  const category = await prisma.category.create({
    data: { name: 'Cat test', slug: 'cat-test', baseMarkupPct: 60 },
  });

  const product = await prisma.product.create({
    data: {
      name: 'Producto test',
      sku: 'PTK-TEST-000001',
      categoryId: category.id,
      assemblyMinutes: 6,
      managementMinutes: 4,
      marketingMonthly: 0,
      estimatedUnitsMonth: 1,
      pieces: {
        create: [{ name: 'Cuerpo', grams: 50, printMinutes: 90, defaultFilamentId: filament.id }],
      },
      materials: { create: [{ materialId: material.id, quantity: 2 }] },
      channels: { create: [{ channelId: channel.id, isEnabled: true }] },
    },
  });

  return {
    userId: user.id,
    channelId: channel.id,
    categoryId: category.id,
    productId: product.id,
    filamentId: filament.id,
    materialId: material.id,
  };
}
