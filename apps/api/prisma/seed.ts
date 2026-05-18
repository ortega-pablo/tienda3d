/**
 * Seed script — initializes the database with:
 *   - Permissions catalog and base roles (admin / operator / viewer)
 *   - Admin user from SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD env
 *   - Global parameters from cotizador_cuaderno_plastik_v2.xlsx
 *   - Bambu Lab A1 machine
 *   - Demo channels mirroring the Excel
 */

import { ChannelKind, MaterialType, MaterialUnit, PrismaClient, TaxMode } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // Parameters
  'parameter:read',
  'parameter:write',
  // Machines
  'machine:read',
  'machine:write',
  // Suppliers
  'supplier:read',
  'supplier:write',
  // Materials & stock
  'material:read',
  'material:write',
  'stock:read',
  'stock:write',
  // Products
  'product:read',
  'product:write',
  // Categories
  'category:read',
  'category:write',
  // Channels
  'channel:read',
  'channel:write',
  // Quotes
  'quote:read',
  'quote:create',
  'quote:export',
  // Production
  'production:read',
  'production:execute',
  // Admin
  'user:read',
  'user:manage',
  'role:manage',
  'audit:read',
  // Sensitive: see "cash without invoice" prices
  'pricing:no-invoice:read',
] as const;

const VIEWER_PERMS = PERMISSIONS.filter((p) => p.endsWith(':read'));
const OPERATOR_PERMS = PERMISSIONS.filter(
  (p) =>
    ![
      'parameter:write',
      'user:manage',
      'role:manage',
      'pricing:no-invoice:read',
    ].includes(p),
);

async function seedPermissions() {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key },
    });
  }
}

async function seedRoles() {
  const all = await prisma.permission.findMany();
  const byKey = new Map(all.map((p) => [p.key, p.id]));

  const ensureRole = async (
    name: string,
    description: string,
    permissionKeys: readonly string[],
  ) => {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description, isSystem: true },
      create: { name, description, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionKeys
        .map((k) => byKey.get(k))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
    });
    return role;
  };

  const admin = await ensureRole('admin', 'Acceso total al sistema', PERMISSIONS);
  const operator = await ensureRole(
    'operator',
    'Operación diaria sin tocar usuarios ni parámetros sensibles',
    OPERATOR_PERMS,
  );
  const viewer = await ensureRole('viewer', 'Solo lectura', VIEWER_PERMS);

  return { admin, operator, viewer };
}

async function seedAdminUser(roleId: string) {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@plastik.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const passwordHash = await argon2.hash(password);
  await prisma.user.upsert({
    where: { email },
    update: { roleId, isActive: true },
    create: {
      email,
      name: 'Administrador',
      passwordHash,
      isActive: true,
      roleId,
    },
  });
  console.log(`✔ Admin user → ${email} / ${password}`);
}

async function seedGlobalParams() {
  // Values come straight from the Excel "Parámetros" sheet.
  const params: Array<[string, string, string]> = [
    ['kwh_cost', '303.98', 'Costo del kWh con todos los impuestos (ARS)'],
    ['labor_hour_cost', '5000', 'Valor hora de mano de obra (ARS)'],
    ['design_hour_cost', '0', 'Valor hora de diseño 3D (ARS) — surcharge plano por línea ADHOC'],
    ['keychain_batch_size', '5', 'Tamaño del batch de llaveros — los inputs de la cotización son totales para esta cantidad'],
    ['adhoc_default_markup_pct', '60', 'Markup default (%) para cotizaciones a medida sin producto ni tier de keychain. Cliente SPECIAL con customMarkupPct lo pisa.'],
    ['contingency_pct', '5', 'Contingencia aplicada al costo de producción (%)'],
    ['reinvestment_pct', '10', 'Reinversión aplicada al costo de producción (%)'],
    ['unified_regime_pct', '4', 'Régimen unificado Mendoza (%) — modelo simple'],
    ['direct_sale_commission_pct', '6.5', 'Comisión global del canal Venta Directa (%)'],
    ['currency', 'ARS', 'Moneda principal del sistema'],
  ];
  for (const [key, value, description] of params) {
    await prisma.globalParam.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
    });
  }
}

async function seedMachine() {
  const existing = await prisma.machine.findFirst({ where: { isActive: true } });
  if (existing) return;
  await prisma.machine.create({
    data: {
      name: 'Bambu Lab A1',
      isActive: true,
      acquisitionCost: 1_400_000,
      residualValue: 350_000,
      usefulLifeHours: 6_000,
      powerW: 260,
      annualMaintenance: 80_000,
      annualUsageHours: 2_000,
    },
  });
}

async function seedChannels() {
  // System channels (typed). Mayorista is removed as a channel — tiers per
  // product cover wholesale-style scales within any enabled channel.
  const systemChannels: Array<{
    name: string;
    slug: string;
    icon: string;
    sortOrder: number;
    kind: ChannelKind;
    commissionPct: number;
    unifiedRegimePct: number;
    withInvoiceDefault?: boolean;
  }> = [
    {
      name: 'Venta Directa',
      slug: 'directa',
      icon: '💬',
      sortOrder: 1,
      kind: ChannelKind.DIRECT_SALE,
      commissionPct: 6.5, // unused — DIRECT_SALE pulls from direct_sale_commission_pct global
      unifiedRegimePct: 4,
    },
    {
      name: 'MercadoLibre',
      slug: 'mercadolibre',
      icon: '🛒',
      sortOrder: 2,
      kind: ChannelKind.MARKETPLACE,
      commissionPct: 0, // unused — MELI commission is required per product
      unifiedRegimePct: 4,
      withInvoiceDefault: true,
    },
    {
      name: 'Efectivo',
      slug: 'efectivo',
      icon: '💵',
      sortOrder: 3,
      kind: ChannelKind.CASH,
      commissionPct: 0,
      unifiedRegimePct: 4, // CASH applies regime by default; admin can toggle "sin factura"
    },
  ];
  for (const c of systemChannels) {
    await prisma.channel.upsert({
      where: { slug: c.slug },
      update: { ...c, isSystem: true, isActive: true, taxMode: TaxMode.SIMPLE },
      create: { ...c, isSystem: true, taxMode: TaxMode.SIMPLE },
    });
  }

  // Soft-deactivate the legacy "Mayorista" channel without deleting it so
  // historical quotes that reference it stay readable.
  await prisma.channel
    .update({
      where: { slug: 'mayorista' },
      data: { isActive: false, isSystem: false, kind: ChannelKind.CUSTOM },
    })
    .catch(() => undefined);
}

async function seedDemoMaterials() {
  // Filament parent: holds price (via SupplierMaterial), unit, density, waste.
  // Children hold per-color stock. Excel reference price: Parámetros!C6 = 28234.
  const plaParent = await prisma.material.upsert({
    where: { sku: 'PLA-GENERICO' },
    update: {},
    create: {
      name: 'PLA Genérico',
      sku: 'PLA-GENERICO',
      type: MaterialType.FILAMENT,
      unit: MaterialUnit.KG,
      brand: 'Genérico',
      densityGCm3: 1.24,
      wastePct: 5,
      currentStock: 0,
      minStock: 0,
      lowStockAlert: false,
    },
  });

  // Single child variant so the seed system has a usable color out of the box.
  const plaWhite = await prisma.material.upsert({
    where: { sku: 'PLA-WHITE-GENERIC' },
    update: {},
    create: {
      name: 'PLA Genérico · Blanco',
      sku: 'PLA-WHITE-GENERIC',
      type: MaterialType.FILAMENT,
      unit: MaterialUnit.KG,
      brand: 'Genérico',
      color: 'Blanco',
      colorHex: '#FFFFFF',
      densityGCm3: 1.24,
      wastePct: 5,
      currentStock: 0,
      minStock: 1,
      parentId: plaParent.id,
    },
  });

  // Sheets reference price (Parámetros!C7 = 17844 / resma 500)
  const sheets = await prisma.material.upsert({
    where: { sku: 'A5-RESMA-500' },
    update: {},
    create: {
      name: 'Hojas A5 (unidad)',
      sku: 'A5-RESMA-500',
      type: MaterialType.SHEET,
      unit: MaterialUnit.UNIT,
      wastePct: 0,
      currentStock: 0,
    },
  });

  return { pla: plaParent, plaChild: plaWhite, sheets };
}

async function seedDemoSupplierPrices(materials: {
  pla: { id: string };
  sheets: { id: string };
}) {
  // Demo supplier so the prices below have a counterparty.
  const supplier = await prisma.supplier.upsert({
    where: { id: 'demo-supplier' },
    update: {},
    create: {
      id: 'demo-supplier',
      name: 'Proveedor demo',
      contact: 'Demo',
      isActive: true,
    },
  });

  const ensureCurrentPrice = async (
    materialId: string,
    price: number,
  ): Promise<void> => {
    const existing = await prisma.supplierMaterial.findFirst({
      where: { materialId, isCurrent: true },
    });
    if (existing) return;
    await prisma.supplierMaterial.create({
      data: {
        materialId,
        supplierId: supplier.id,
        price,
        currency: 'ARS',
        isCurrent: true,
        notes: 'Cargado por seed (referencia Excel)',
      },
    });
  };

  // PLA: $28234 / kg (Excel Parámetros!C6)
  await ensureCurrentPrice(materials.pla.id, 28_234);
  // Sheets: $17844 / resma de 500 → $/hoja = 17844/500 = 35.688
  await ensureCurrentPrice(materials.sheets.id, 17_844 / 500);
}

async function seedKeychainDefaults() {
  // Singleton: una sola fila con id estable. El admin completa los valores
  // desde /parametros/llaveros — acá solo garantizamos que la fila existe.
  await prisma.keychainDefaults.upsert({
    where: { id: 'keychain_defaults_singleton' },
    update: {},
    create: {
      id: 'keychain_defaults_singleton',
      pieceName: 'Llavero',
      pieceGrams: 0,
      piecePrintMinutes: 0,
      assemblyMinutes: 0,
      managementMinutes: 0,
    },
  });
}

async function seedUnsortedCategory() {
  // Categoría parking lot para productos sin clasificar. La migración la
  // crea con id estable `cat_unsorted` para que productos huérfanos puedan
  // sobrevivir el cambio a `categoryId NOT NULL`. Este upsert garantiza
  // que también existe en setups limpios (sin migración previa).
  await prisma.category.upsert({
    where: { slug: 'sin-clasificar' },
    update: {},
    create: {
      id: 'cat_unsorted',
      name: 'Sin clasificar',
      slug: 'sin-clasificar',
      isActive: true,
      sortOrder: 9999,
      baseMarkupPct: 100,
    },
  });
}

async function seedDemoProduct(materials: {
  pla: { id: string };
  sheets: { id: string };
}) {
  let product = await prisma.product.findFirst({ where: { sku: 'CDR-A5-8D' } });

  if (!product) {
    product = await prisma.product.create({
      data: {
        sku: 'CDR-A5-8D',
        name: 'Cuaderno A5 — 8 discos',
        description: 'Modelo base del Excel cotizador (referencia para validación de costos).',
        isActive: true,
        marketingMonthly: 15_000,
        estimatedUnitsMonth: 20,
        assemblyMinutes: 45,
        managementMinutes: 15,
        // Demo product entra en "sin-clasificar". El admin lo reclasifica
        // después de cargar las categorías reales.
        categoryId: 'cat_unsorted',
        pieces: {
          create: [
            { name: 'Tapa delantera', grams: 60, printMinutes: 150, defaultFilamentId: materials.pla.id, sortOrder: 0 },
            { name: 'Tapa trasera', grams: 60, printMinutes: 150, defaultFilamentId: materials.pla.id, sortOrder: 1 },
            { name: 'Discos (8 unid.)', grams: 15, printMinutes: 75, defaultFilamentId: materials.pla.id, sortOrder: 2 },
          ],
        },
        materials: { create: [{ materialId: materials.sheets.id, quantity: 80 }] },
      },
    });
  }

  // Wire system channels (Directa + Efectivo) by default. MELI is opt-in.
  const systemChannels = await prisma.channel.findMany({
    where: { slug: { in: ['directa', 'efectivo'] } },
  });
  for (const channel of systemChannels) {
    await prisma.productChannel.upsert({
      where: { productId_channelId: { productId: product.id, channelId: channel.id } },
      update: {},
      create: { productId: product.id, channelId: channel.id, isEnabled: true },
    });
  }
}

async function seedKeychainTiers() {
  // Estructura inmutable (5 filas). Solo el markupPct se edita después
  // desde /parametros/llaveros. Los ids son fijos para que el upsert sea
  // idempotente entre re-seeds y la migración inicial.
  const rows: Array<{
    id: string;
    minQty: number;
    maxQty: number | null;
    markupPct: number;
    sortOrder: number;
  }> = [
    { id: 'kt_1_4', minQty: 1, maxQty: 4, markupPct: 100, sortOrder: 1 },
    { id: 'kt_5_20', minQty: 5, maxQty: 20, markupPct: 80, sortOrder: 2 },
    { id: 'kt_25_35', minQty: 25, maxQty: 35, markupPct: 60, sortOrder: 3 },
    { id: 'kt_40_95', minQty: 40, maxQty: 95, markupPct: 50, sortOrder: 4 },
    { id: 'kt_100_up', minQty: 100, maxQty: null, markupPct: 35, sortOrder: 5 },
  ];
  for (const row of rows) {
    await prisma.keychainTier.upsert({
      where: { minQty: row.minQty },
      update: {},
      create: row,
    });
  }
}

async function main() {
  console.log('▶ Seeding database…');
  await seedPermissions();
  console.log('✔ Permissions');
  const roles = await seedRoles();
  console.log('✔ Roles');
  await seedAdminUser(roles.admin.id);
  await seedGlobalParams();
  console.log('✔ Global parameters (from Excel)');
  await seedKeychainTiers();
  console.log('✔ Keychain bulk tiers (1-4 / 5-20 / 25-35 / 40-95 / 100+)');
  await seedKeychainDefaults();
  console.log('✔ Keychain defaults singleton');
  await seedUnsortedCategory();
  console.log('✔ "Sin clasificar" category (parking lot)');
  await seedMachine();
  console.log('✔ Machine (Bambu Lab A1)');
  await seedChannels();
  console.log('✔ Channels (Directa / MELI / Efectivo) + Mayorista deactivated');
  const materials = await seedDemoMaterials();
  console.log('✔ Demo materials');
  await seedDemoSupplierPrices(materials);
  console.log('✔ Demo supplier prices');
  await seedDemoProduct(materials);
  console.log('✔ Demo product (Cuaderno A5)');
  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
