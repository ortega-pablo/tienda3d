import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MUTATING_METHODS, collectRoutes, type RouteInfo } from './route-permissions';

const MODULES_DIR = join(__dirname, '..', '..', 'modules');
const SEED_PATH = join(__dirname, '..', '..', '..', 'prisma', 'seed.ts');

/**
 * Endpoints que a propósito no exigen permiso. Cualquier ruta nueva sin
 * `@Permissions` tiene que sumarse acá explícitamente, con su motivo.
 */
const INTENTIONALLY_OPEN = new Set([
  'AuthController.login', // pública: es el login
  'AuthController.refresh', // pública: rota el token con la cookie
  'AuthController.logout', // pública: no debe fallar si la sesión ya venció
  'AuthController.me', // sólo exige sesión (JwtAuthGuard), no un permiso
  'HealthController.health', // pública: la usa el healthcheck del contenedor
]);

/**
 * Endpoints que usan POST pero NO mutan estado: son cálculos que reciben el
 * input por body porque no entra en la query string. Para ellos un permiso de
 * lectura es correcto.
 */
const COMPUTE_ONLY_POSTS = new Set([
  'ProductsController.costWithOverrides', // mismo cálculo que GET :id/cost, con overrides
]);

let routes: RouteInfo[];

beforeAll(() => {
  routes = collectRoutes(MODULES_DIR);
});

describe('permisos de los endpoints', () => {
  it('encuentra los controllers del proyecto', () => {
    expect(routes.length).toBeGreaterThan(80);
  });

  it('toda ruta exige un permiso, salvo las declaradas abiertas', () => {
    const unguarded = routes
      .filter((r) => r.permissions.length === 0)
      .filter((r) => !INTENTIONALLY_OPEN.has(`${r.controller}.${r.handler}`))
      .map((r) => `${r.method} ${r.path} (${r.controller}.${r.handler})`);
    expect(unguarded).toEqual([]);
  });

  /**
   * El guard de F-04: `PATCH /quotes/:id/status` exigía `quote:read`, así que
   * el rol viewer —que tiene todos los permisos terminados en `:read`— podía
   * aceptar cotizaciones, y aceptar imputa volúmenes mensuales.
   *
   * Ninguna ruta que muta estado puede conformarse con permisos de lectura.
   */
  it('ninguna ruta que muta estado se conforma con un permiso de lectura', () => {
    const readOnlyMutations = routes
      .filter((r) => MUTATING_METHODS.has(r.method))
      .filter((r) => !COMPUTE_ONLY_POSTS.has(`${r.controller}.${r.handler}`))
      .filter((r) => r.permissions.length > 0)
      .filter((r) => r.permissions.every((p) => p.endsWith(':read')))
      .map((r) => `${r.method} ${r.path} exige [${r.permissions.join(', ')}]`);
    expect(readOnlyMutations).toEqual([]);
  });

  /**
   * El guard de F-01: el catálogo `PERMISSIONS` del seed no incluía los
   * permisos que agregaron migraciones posteriores (`customer:*`), y como
   * `seedRoles` borraba y recreaba, correr el seed dejaba a todos los roles sin
   * acceso al módulo de clientes.
   *
   * Todo permiso que exija un endpoint tiene que existir en el seed.
   */
  it('todo permiso exigido por un endpoint existe en el catálogo del seed', () => {
    const seed = readFileSync(SEED_PATH, 'utf8');
    const seeded = new Set(
      [...seed.matchAll(/'([a-z]+:[a-z:]+)'/g)].map((m) => m[1]!),
    );
    const used = new Set(routes.flatMap((r) => r.permissions));
    const missing = [...used].filter((p) => !seeded.has(p)).sort();
    expect(missing).toEqual([]);
  });
});
