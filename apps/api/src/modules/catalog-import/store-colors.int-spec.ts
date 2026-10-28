import { MaterialType, MaterialUnit } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MaterialsService } from '@/modules/materials/materials.service';
import { TEST_DATABASE_URL } from '../../../test/db-url';
import { bootTestApp, truncateAll } from '../../../test/harness';
import { STORE_COLORS } from './store-colors';

/**
 * F9·1: el script carga los 11 colores de la web en la línea de filamento, sin
 * pisar lo que ya cargó la dueña, y se puede correr de nuevo sin duplicar.
 */
describe('[int] Colores de la web en el sistema', () => {
  let prisma: PrismaService;
  let materials: MaterialsService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const app = await bootTestApp();
    ({ prisma, close } = app);
    materials = app.moduleRef.get(MaterialsService);
  });

  afterAll(async () => {
    await close();
  });

  let lineId: string;
  beforeEach(async () => {
    await truncateAll(prisma);
    const line = await prisma.material.create({
      data: {
        name: 'PLA Genérico',
        sku: 'PLA-GENERICO',
        type: MaterialType.FILAMENT,
        unit: MaterialUnit.KG,
        brand: 'Genérico',
      },
    });
    lineId = line.id;
    // Lo que trae la base de hoy: el Blanco, cargado a mano y en mayúsculas.
    await prisma.material.create({
      data: {
        name: 'PLA Genérico · Blanco',
        type: MaterialType.FILAMENT,
        unit: MaterialUnit.KG,
        parentId: line.id,
        color: 'Blanco',
        colorHex: '#FFFFFF',
        currentStock: 3,
      },
    });
  });

  const run = (args: string[] = []) =>
    execFileSync(
      join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'tsx'),
      ['scripts/store-colors.ts', ...args],
      {
        cwd: join(__dirname, '..', '..', '..'),
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
  const filamentColors = async () => {
    const lines = await materials.list({ type: MaterialType.FILAMENT, activeOnly: true });
    return lines.find((l) => l.id === lineId)!.children!;
  };

  it('la simulación informa y no cambia nada', async () => {
    const out = run(['--dry-run']);
    expect(out).toMatch(/10 se agregarían, 0 con código completado, 1 ya estaban/);
    expect(await filamentColors()).toHaveLength(1);
  });

  it('carga los 11 colores con su código y una segunda corrida no duplica', async () => {
    expect(run()).toMatch(/10 agregados/);
    const children = await filamentColors();
    expect(children.map((c) => [c.color, c.colorHex?.toLowerCase()]).sort()).toEqual(
      STORE_COLORS.map((c) => [c.color, c.colorHex]).sort(),
    );
    // Como el alta desde Insumos: hereda unidad y marca de la línea.
    const negro = children.find((c) => c.color === 'Negro')!;
    expect(negro).toMatchObject({ name: 'PLA Genérico · Negro', unit: 'KG', brand: 'Genérico' });
    // El Blanco de la dueña queda como estaba, con su stock.
    expect(children.find((c) => c.color === 'Blanco')).toMatchObject({
      colorHex: '#FFFFFF',
      currentStock: 3,
    });

    expect(run()).toMatch(/0 agregados, 0 con código completado, 11 ya estaban/);
    expect(await filamentColors()).toHaveLength(11);
  });

  it('no reactiva ni pisa: lo informa', async () => {
    await prisma.material.create({
      data: {
        name: 'PLA Genérico · Perla',
        type: MaterialType.FILAMENT,
        unit: MaterialUnit.KG,
        parentId: lineId,
        color: 'Perla',
        isActive: false,
      },
    });
    await prisma.material.updateMany({ where: { color: 'Blanco' }, data: { colorHex: '#fafafa' } });

    const out = run();
    expect(out).toMatch(/Perla: está dado de baja/);
    expect(out).toMatch(/Blanco: el sistema usa #fafafa y la web #ffffff; queda el del sistema/);
    expect(out).toMatch(/9 agregados, 0 con código completado, 0 ya estaban, 2 para revisar/);
    expect(await prisma.material.count({ where: { color: 'Perla' } })).toBe(1);
  });

  it('una línea que no existe da error y lista las que hay', () => {
    expect(() => run(['--line', 'PETG-X'])).toThrow(/No hay una línea.*PLA-GENERICO PLA Genérico/s);
  });
});
