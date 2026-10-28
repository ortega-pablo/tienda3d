/**
 * Carga en el sistema los colores que vende hoy la web (plan F9·1, D12: la
 * tienda solo ofrece colores que existen acá). Agrega los que faltan como
 * variantes de una línea de filamento y completa el código de color de los que
 * ya están. No pisa ni reactiva nada: lo que difiere lo informa. Idempotente.
 *
 *   pnpm store:colors [--line PLA-GENERICO] [--dry-run]
 *
 * En el ecosistema, dentro del contenedor de la API:
 *   docker compose exec tienda3d-api ./node_modules/.bin/tsx scripts/store-colors.ts --dry-run
 */
import '../src/common/config/load-secret-files';
import { MaterialType, PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { planStoreColors, type ColorStep } from '../src/modules/catalog-import/store-colors';

const DEFAULT_LINE = 'PLA-GENERICO';

function explain(step: ColorStep): string {
  switch (step.kind) {
    case 'create':
      return `+ ${step.color} (${step.colorHex}): se agrega`;
    case 'set-hex':
      return `~ ${step.color}: ya estaba, se le completa el código ${step.colorHex}`;
    case 'ok':
      return `= ${step.color}: ya estaba`;
    case 'other-hex':
      return `! ${step.color}: el sistema usa ${step.systemHex} y la web ${step.webHex}; queda el del sistema`;
    case 'inactive':
      return `! ${step.color}: está dado de baja; la tienda no lo ofrece hasta que se reactive desde Insumos`;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      line: { type: 'string', default: DEFAULT_LINE },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const dryRun = values['dry-run'];
  const prisma = new PrismaClient();
  try {
    const line = await prisma.material.findUnique({
      where: { sku: values.line },
      include: { children: true },
    });
    if (!line || line.type !== MaterialType.FILAMENT || line.parentId) {
      const lines = await prisma.material.findMany({
        where: { type: MaterialType.FILAMENT, parentId: null },
        select: { sku: true, name: true },
        orderBy: { name: 'asc' },
      });
      const options = lines.map((l) => `${l.sku ?? '(sin SKU)'} ${l.name}`).join(', ');
      throw new Error(
        `No hay una línea de filamento con SKU ${values.line}. Líneas: ${options || 'ninguna'}.`,
      );
    }

    const plan = planStoreColors(line.children);
    console.log(`Línea ${line.name} (${line.sku})${dryRun ? ' · simulación' : ''}`);
    for (const step of plan) console.log(`  ${explain(step)}`);

    const created = plan.filter((s) => s.kind === 'create');
    const hexes = plan.filter((s) => s.kind === 'set-hex');
    if (!dryRun) {
      await prisma.$transaction([
        // Como el alta de una variante desde Insumos: hereda unidad y marca.
        ...created.map((s) =>
          prisma.material.create({
            data: {
              name: `${line.name} · ${s.color}`,
              type: MaterialType.FILAMENT,
              unit: line.unit,
              parentId: line.id,
              brand: line.brand,
              color: s.color,
              colorHex: s.colorHex,
            },
          }),
        ),
        ...hexes.map((s) =>
          prisma.material.update({ where: { id: s.id }, data: { colorHex: s.colorHex } }),
        ),
      ]);
    }
    const verb = dryRun ? 'se agregarían' : 'agregados';
    const warnings = plan.filter((s) => s.kind === 'other-hex' || s.kind === 'inactive').length;
    console.log(
      `${created.length} ${verb}, ${hexes.length} con código completado, ` +
        `${plan.length - created.length - hexes.length - warnings} ya estaban, ${warnings} para revisar.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
