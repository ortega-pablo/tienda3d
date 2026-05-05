"use strict";
/**
 * Seed script — initializes the database with:
 *   - Permissions catalog and base roles (admin / operator / viewer)
 *   - Admin user from SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD env
 *   - Global parameters from cotizador_cuaderno_plastik_v2.xlsx
 *   - Bambu Lab A1 machine
 *   - Demo channels mirroring the Excel
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const argon2 = __importStar(require("argon2"));
const prisma = new client_1.PrismaClient();
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
];
const VIEWER_PERMS = PERMISSIONS.filter((p) => p.endsWith(':read'));
const OPERATOR_PERMS = PERMISSIONS.filter((p) => !['parameter:write', 'user:manage', 'role:manage'].includes(p));
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
    const ensureRole = async (name, description, permissionKeys) => {
        const role = await prisma.role.upsert({
            where: { name },
            update: { description, isSystem: true },
            create: { name, description, isSystem: true },
        });
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        await prisma.rolePermission.createMany({
            data: permissionKeys
                .map((k) => byKey.get(k))
                .filter((id) => Boolean(id))
                .map((permissionId) => ({ roleId: role.id, permissionId })),
        });
        return role;
    };
    const admin = await ensureRole('admin', 'Acceso total al sistema', PERMISSIONS);
    const operator = await ensureRole('operator', 'Operación diaria sin tocar usuarios ni parámetros sensibles', OPERATOR_PERMS);
    const viewer = await ensureRole('viewer', 'Solo lectura', VIEWER_PERMS);
    return { admin, operator, viewer };
}
async function seedAdminUser(roleId) {
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
    const params = [
        ['kwh_cost', '303.98', 'Costo del kWh con todos los impuestos (ARS)'],
        ['labor_hour_cost', '5000', 'Valor hora de mano de obra (ARS)'],
        ['contingency_pct', '5', 'Contingencia aplicada al costo de producción (%)'],
        ['reinvestment_pct', '10', 'Reinversión aplicada al costo de producción (%)'],
        ['unified_regime_pct', '4', 'Régimen unificado Mendoza (%) — modelo simple'],
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
    if (existing)
        return;
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
    const channels = [
        {
            name: 'Venta Directa',
            slug: 'directa',
            icon: '💬',
            sortOrder: 1,
            marginPct: 35,
            commissionPct: 6.5,
            unifiedRegimePct: 4,
        },
        {
            name: 'MercadoLibre',
            slug: 'mercadolibre',
            icon: '🛒',
            sortOrder: 2,
            marginPct: 35,
            commissionPct: 13,
            unifiedRegimePct: 4,
            withInvoiceDefault: true,
        },
        {
            name: 'Mayorista',
            slug: 'mayorista',
            icon: '📦',
            sortOrder: 3,
            marginPct: 30,
            commissionPct: 6.5,
            unifiedRegimePct: 4,
            withInvoiceDefault: true,
        },
        {
            name: 'Efectivo',
            slug: 'efectivo',
            icon: '💵',
            sortOrder: 4,
            marginPct: 35,
            commissionPct: 0,
            unifiedRegimePct: 0,
        },
    ];
    for (const c of channels) {
        await prisma.channel.upsert({
            where: { slug: c.slug },
            update: c,
            create: { ...c, taxMode: client_1.TaxMode.SIMPLE },
        });
    }
}
async function seedDemoMaterials() {
    // Filament reference price from the Excel (Parámetros!C6 = 28234)
    const pla = await prisma.material.upsert({
        where: { sku: 'PLA-WHITE-GENERIC' },
        update: {},
        create: {
            name: 'PLA Blanco Genérico',
            sku: 'PLA-WHITE-GENERIC',
            type: client_1.MaterialType.FILAMENT,
            unit: client_1.MaterialUnit.KG,
            brand: 'Genérico',
            color: 'Blanco',
            colorHex: '#FFFFFF',
            densityGCm3: 1.24,
            wastePct: 5,
            currentStock: 0,
            minStock: 1,
        },
    });
    // Sheets reference price (Parámetros!C7 = 17844 / resma 500)
    const sheets = await prisma.material.upsert({
        where: { sku: 'A5-RESMA-500' },
        update: {},
        create: {
            name: 'Hojas A5 (unidad)',
            sku: 'A5-RESMA-500',
            type: client_1.MaterialType.SHEET,
            unit: client_1.MaterialUnit.UNIT,
            wastePct: 0,
            currentStock: 0,
        },
    });
    return { pla, sheets };
}
async function seedDemoSupplierPrices(materials) {
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
    const ensureCurrentPrice = async (materialId, price) => {
        const existing = await prisma.supplierMaterial.findFirst({
            where: { materialId, isCurrent: true },
        });
        if (existing)
            return;
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
async function seedDemoProduct(materials) {
    const existing = await prisma.product.findFirst({ where: { sku: 'CDR-A5-8D' } });
    if (existing)
        return;
    await prisma.product.create({
        data: {
            sku: 'CDR-A5-8D',
            name: 'Cuaderno A5 — 8 discos',
            description: 'Modelo base del Excel cotizador (referencia para validación de costos).',
            isActive: true,
            marketingMonthly: 15_000,
            estimatedUnitsMonth: 20,
            assemblyMinutes: 45,
            managementMinutes: 15,
            pieces: {
                create: [
                    {
                        name: 'Tapa delantera',
                        grams: 60,
                        printMinutes: 150,
                        defaultFilamentId: materials.pla.id,
                        sortOrder: 0,
                    },
                    {
                        name: 'Tapa trasera',
                        grams: 60,
                        printMinutes: 150,
                        defaultFilamentId: materials.pla.id,
                        sortOrder: 1,
                    },
                    {
                        name: 'Discos (8 unid.)',
                        grams: 15,
                        printMinutes: 75,
                        defaultFilamentId: materials.pla.id,
                        sortOrder: 2,
                    },
                ],
            },
            materials: {
                create: [
                    {
                        materialId: materials.sheets.id,
                        quantity: 80,
                    },
                ],
            },
        },
    });
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
    await seedMachine();
    console.log('✔ Machine (Bambu Lab A1)');
    await seedChannels();
    console.log('✔ Channels (Directa / MELI / Mayorista / Efectivo)');
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
//# sourceMappingURL=seed.js.map