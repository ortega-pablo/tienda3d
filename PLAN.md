# Plastik 3D — Plan de Acción Completo

> Sistema de cotización, costeo, control de stock y catálogo de productos para manufactura aditiva (impresión 3D).
> Basado fielmente en el modelo de costos del Excel `cotizador_cuaderno_plastik_v2.xlsx`.

---

## 1. Modelo de Negocio

**Plastik** produce y comercializa productos compuestos por:

- **Piezas impresas** en filamento (cada combinación marca + color es un SKU independiente).
- **Insumos no impresos**: hojas, packaging, hardware (tornillos, imanes), etc.
- **Tiempo de mano de obra**: armado y gestión.

La cadena de valor es:

```
Proveedores → Insumos (con stock real) → Recetas de producto
                          ↓
        Hora-máquina (compartida entre todos los productos)
                          ↓
        CostingEngine (suma componentes + provisiones)
                          ↓
        PricingEngine (precio por canal × tipo de factura)
                          ↓
        Cotizaciones / Órdenes de producción (descuentan stock)
```

### Reglas de negocio derivadas del Excel

| Regla | Origen Excel | Decisión sistema |
|---|---|---|
| Costo filamento = `(g/1000) × $/kg` | `E7=(C7/1000)*Parámetros!C6` | Igual |
| Desperdicio de materia prima | `Parámetros!C21 = 5%` global | **Por insumo** (cambio aprobado) |
| Hora-máquina = depreciación + energía + mantenimiento | `C32 = C29+C30+C31` | Igual, una sola máquina compartida |
| Marketing prorrateado | `Parámetros!C25 / C26` global | **Por producto** (cambio aprobado) |
| Contingencia y reinversión | 5% y 10% global | Global (configurable) |
| Régimen unificado | 4% global | Global con preparación para modelo fino |
| Precio por canal | `costo / (1 − margen − comisión − régimen)` | Igual, con factura A/B/C como toggle |
| Mayorista ≥10 unidades | Único umbral | **Escalas múltiples por producto** (1-4, 5-29, 30-49, 50+) |

---

## 2. Decisiones Arquitectónicas Clave

### 2.1 Stack tecnológico

| Capa | Elección | Justificación |
|---|---|---|
| Frontend | **Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui** | SSR para listas, RSC reduce bundle, tema centralizado vía CSS variables, ecosistema fuerte. |
| Backend | **NestJS 11 + TypeScript** | Modular, DI, testable, comparte tipos con el front. |
| ORM | **Prisma 6** | Migraciones declarativas, tipos generados, ergonómico. |
| DB | **PostgreSQL 16** | Transaccional, robusto, soportado en RDS. |
| Validación | **Zod** (compartido front/back) | Schemas únicos en `packages/shared`. |
| Auth | **JWT + refresh tokens** + RBAC dinámico | Permite agregar roles/permisos sin redeploy. |
| Estado client | **TanStack Query** | Cache, invalidación, mutaciones. |
| Forms | **React Hook Form + Zod resolver** | Performance + validación compartida. |
| PDF | **@react-pdf/renderer** o **puppeteer** | Cotizaciones impresas. |
| Tests | **Vitest** (front) + **Jest** (back) + **Playwright** (E2E) | Estándar. |
| Monorepo | **pnpm workspaces** | Liviano, sin Nx hasta que haga falta. |
| Contenedores | **Docker + docker-compose** | Local hoy, base para AWS mañana. |

### 2.2 Patrón arquitectónico — Monolito modular con Clean Architecture liviana

**Backend** dividido en módulos de dominio. Cada módulo expone:

```
modules/<dominio>/
├── <dominio>.module.ts       # NestJS module
├── <dominio>.controller.ts   # HTTP layer (REST)
├── <dominio>.service.ts      # Casos de uso (orquesta dominio + repo)
├── <dominio>.repository.ts   # Acceso a datos (Prisma)
├── domain/                   # Entidades puras y reglas de negocio
│   └── <entidad>.ts
├── dto/                      # Schemas Zod de entrada/salida
└── <dominio>.service.spec.ts # Tests unitarios
```

Servicios de dominio cross-module:

- `CostingEngine` — calcula costo unitario de un producto.
- `PricingEngine` — deriva precios por canal (estrategia `Simple` o `Detailed`).
- `MachineHourCalculator` — `$/h` de la máquina activa.
- `StockService` — descuenta materiales al confirmar producción.
- `PdfService` — render de cotizaciones.

### 2.3 Migración tributaria simple → fina

Cada `Channel` lleva un campo `tax_mode: SIMPLE | DETAILED`.

- `SIMPLE`: usa `unified_regime_pct` (modo Excel actual).
- `DETAILED`: usa `iibb_pct`, `applies_iva`, retenciones del canal y `invoice_type`.

`PricingEngine` selecciona la estrategia según el flag, sin condicionales gigantes:

```typescript
class PricingEngine {
  constructor(private strategies: Map<TaxMode, TaxStrategy>) {}
  price(cost, channel) {
    return this.strategies.get(channel.tax_mode).compute(cost, channel);
  }
}
```

### 2.4 Theming centralizado

CSS variables HSL en `:root` + `.dark`. Un único archivo `globals.css` con `@theme inline` (Tailwind v4) que mapea las variables a tokens semánticos: `bg-background`, `text-foreground`, `border-border`, etc.

Cambiar la marca = editar 1 archivo de variables. Modo claro/oscuro vía `next-themes`.

---

## 3. Modelo de Datos (Prisma)

```prisma
// === IDENTIDAD Y RBAC ===
User { id, email, name, password_hash, role_id, is_active, created_at }
Role { id, name, description, is_system }
Permission { id, key, description }
RolePermission { role_id, permission_id }

// === PARÁMETROS GLOBALES ===
GlobalParam { key, value, description, updated_at }
// Claves: kwh_cost, labor_hour_cost, contingency_pct, reinvestment_pct,
//         unified_regime_pct, currency

// === EQUIPAMIENTO ===
Machine {
  id, name, is_active,
  acquisition_cost, residual_value, useful_life_hours,
  power_w, annual_maintenance, annual_usage_hours,
  created_at, updated_at
}
// is_active = true en una sola máquina (la usada para el cálculo)

// === PROVEEDORES ===
Supplier { id, name, contact, phone, email, notes, is_active }

// === INSUMOS ===
Material {
  id, name, sku, type[FILAMENT|SHEET|PACKAGING|HARDWARE|OTHER],
  unit[KG|G|UNIT|REAM|METER|LITER],
  waste_pct,            // ← desperdicio por insumo
  current_stock, min_stock, low_stock_alert,
  notes, image_url
}
FilamentMaterial extends Material {
  brand, color, color_hex, density_g_cm3
}

// === HISTÓRICO DE PRECIOS POR PROVEEDOR ===
SupplierMaterial {
  id, supplier_id, material_id,
  price, currency, link, lead_time_days,
  is_current,           // marca el precio vigente seleccionado por el usuario
  registered_at
}

// === PRODUCTOS Y RECETAS ===
Product {
  id, name, sku, image_url, description, is_active,
  marketing_monthly,    // ← por producto
  estimated_units_month,// ← por producto
  assembly_minutes,
  management_minutes
}

ProductPiece {
  id, product_id, name, grams, print_minutes,
  default_filament_id   // sugerencia; al fabricar/cotizar puede sobrescribirse
}

ProductMaterial {
  id, product_id, material_id, quantity
}

// === CANALES DE VENTA ===
Channel {
  id, name, slug, icon, is_active, sort_order,
  margin_pct, commission_pct,
  tax_mode[SIMPLE|DETAILED],
  // SIMPLE
  unified_regime_pct,
  // DETAILED (preparado, opcional)
  iibb_pct, applies_iva, default_invoice_type[A|B|C|X],
  retention_iva_pct, retention_iibb_pct, retention_income_pct,
  // toggles
  with_invoice_default
}

// Override de margen/comisión por producto en un canal específico
ProductChannelOverride { product_id, channel_id, margin_pct?, commission_pct? }

// Escalas mayoristas por producto
ProductPriceTier {
  id, product_id, channel_id,
  min_qty, max_qty,    // 1-4, 5-29, 30-49, 50+
  margin_pct,           // override del canal
  commission_pct,
  notes
}

// === COTIZACIONES ===
Quote {
  id, code, type[PRODUCT|ADHOC], status[DRAFT|SENT|ACCEPTED|REJECTED],
  customer_name, customer_email, customer_phone, customer_category,
  channel_id, with_invoice,
  subtotal, discount, total,
  notes, valid_until, created_by_id, created_at
}

QuoteItem {
  id, quote_id, product_id?, ad_hoc_payload?(json),
  quantity, unit_cost, unit_price, line_total,
  filament_overrides(json)  // colores elegidos por pieza
}

// === PRODUCCIÓN Y STOCK ===
ProductionOrder {
  id, code, product_id, quantity, status[PLANNED|IN_PROGRESS|DONE|CANCELLED],
  total_cost_snapshot, started_at, finished_at, created_by_id
}

StockMovement {
  id, material_id, type[IN|OUT|ADJUSTMENT|WASTE],
  quantity, related_production_id?, related_supplier_id?,
  unit_cost, notes, created_by_id, created_at
}

// === AUDITORÍA ===
AuditLog {
  id, actor_id, entity, entity_id, action, before(json), after(json), at
}
```

---

## 4. Diagrama Funcional

```
┌──────────────────────────────────────────────────────────────────────┐
│                       FRONTEND — Next.js 16                           │
│                                                                       │
│  /login   /dashboard                                                  │
│           ├─ /parametros        Parámetros globales                  │
│           ├─ /equipos           Máquinas y hora-máquina              │
│           ├─ /proveedores       CRUD + histórico de precios          │
│           ├─ /insumos           Catálogo + stock + filamentos        │
│           ├─ /productos         Recetas + canales + escalas          │
│           ├─ /canales           Canales de venta + tax mode          │
│           ├─ /cotizaciones      Lista, nueva, PDF                    │
│           ├─ /produccion        Órdenes, descuentos de stock         │
│           ├─ /reportes          KPIs, márgenes, alertas              │
│           └─ /admin             Usuarios, roles, permisos, auditoría │
└──────────────────────────────────────────────────────────────────────┘
                              │ REST + JWT
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       BACKEND — NestJS 11                             │
│                                                                       │
│  Modules:  auth · users · roles · parameters · machines · suppliers   │
│            materials · products · channels · quotes · productions     │
│                                                                       │
│  Domain services:                                                     │
│   • CostingEngine   • PricingEngine    • MachineHourCalculator        │
│   • StockService    • PdfService       • AuditInterceptor             │
│                                                                       │
│  Cross-cutting:  ZodValidationPipe · JwtGuard · RolesGuard ·          │
│                  HttpExceptionFilter · RequestLogger                  │
└──────────────────────────────────────────────────────────────────────┘
                              │ Prisma
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL 16                                 │
└──────────────────────────────────────────────────────────────────────┘

INTEGRACIONES FUTURAS (stubs preparados):
  ◦ MercadoLibre API   — sync de publicaciones y precios
  ◦ ARCA / AFIP        — facturación electrónica
  ◦ WhatsApp Business  — envío de cotizaciones
```

---

## 5. Estructura del Repositorio

```
tienda3d/
├── PLAN.md
├── docker-compose.yml
├── docker-compose.override.yml         # dev: hot reload, volúmenes
├── .env.example
├── .gitignore
├── package.json                        # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── apps/
│   ├── api/                            # NestJS
│   │   ├── Dockerfile
│   │   ├── Dockerfile.dev
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── common/
│   │       │   ├── prisma/prisma.service.ts
│   │       │   ├── filters/http-exception.filter.ts
│   │       │   ├── interceptors/audit.interceptor.ts
│   │       │   ├── guards/jwt.guard.ts
│   │       │   ├── guards/permissions.guard.ts
│   │       │   └── pipes/zod-validation.pipe.ts
│   │       └── modules/
│   │           ├── auth/
│   │           ├── users/
│   │           ├── roles/
│   │           ├── parameters/
│   │           ├── machines/
│   │           ├── suppliers/
│   │           ├── materials/
│   │           ├── products/
│   │           ├── channels/
│   │           ├── quotes/
│   │           ├── productions/
│   │           └── pricing/            # CostingEngine + PricingEngine
│   │
│   └── web/                            # Next.js 16
│       ├── Dockerfile
│       ├── Dockerfile.dev
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── postcss.config.mjs
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── globals.css         # @theme inline + variables
│           │   ├── (auth)/login/
│           │   └── (protected)/
│           │       ├── layout.tsx
│           │       ├── dashboard/
│           │       ├── parametros/
│           │       ├── equipos/
│           │       ├── proveedores/
│           │       ├── insumos/
│           │       ├── productos/
│           │       ├── canales/
│           │       ├── cotizaciones/
│           │       ├── produccion/
│           │       └── admin/
│           ├── components/ui/          # shadcn primitives
│           ├── components/             # composiciones específicas
│           ├── lib/
│           │   ├── api-client.ts
│           │   ├── auth.ts
│           │   └── utils.ts
│           └── theme/
│               └── tokens.css          # única fuente de variables
│
├── packages/
│   └── shared/                         # tipos + schemas Zod
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── schemas/                # Zod por dominio
│           └── types/
│
└── db/
    └── init.sql                        # crea DB si no existe
```

---

## 6. Roadmap por Fases

Cada fase termina con código corriendo y verificable.

| Fase | Estado | Entregables |
|---|---|---|
| **0 · Setup** | ✅ | Monorepo, docker-compose levantando db+api+web, /health OK, theme base. |
| **1 · Auth + RBAC** | ✅ | Login, JWT, refresh, roles y permisos dinámicos, seed de roles base, proxy en front. |
| **2 · Catálogo base** | ✅ | Parámetros globales, máquina activa con cálculo de hora-máquina, proveedores, insumos (incl. filamentos con marca+color), histórico de precios. |
| **3 · Productos y costeo** | ✅ | Recetas (piezas + materiales), `CostingCalculator` con tests que replican el Excel al céntimo, edición ágil con costo en vivo. |
| **4 · Canales y precios** | ✅ | CRUD canales con tax_mode SIMPLE/DETAILED, escalas mayoristas por producto, overrides, `PricingEngine`, tabla comparativa. |
| **5 · Cotizaciones** | ✅ | Cotizador instantáneo (pieza ad-hoc / servicio), cotización por producto con override de colores, generación de PDF. |
| **6 · Stock y producción** | ✅ | Órdenes de producción que descuentan stock atómicamente, alertas de stock mínimo, registro de movimientos, ajustes manuales. |
| **7 · Reportes y auditoría** | ✅ | Dashboard con KPIs, log de cambios sensibles (parámetros / roles / status), export CSV. |
| **8 · Hardening** | ✅ | Rate limiting (10/min en login), compression, trust proxy, body-size limits, healthcheck robusto, README de deploy. |
| **9 · Stubs integraciones** | ✅ | Estructura para MELI / ARCA / WhatsApp con feature flags + panel de estado en /admin/integraciones. |
| **10 · Portal cliente** | ⏳ post-MVP | Login externo con categoría asignada (minorista / mayorista escala N), vista de catálogo con su precio. |

**MVP cerrado (fases 0-9).** 22/22 tests verdes; costeo y precios validados al céntimo contra el Excel `cotizador_cuaderno_plastik_v2.xlsx`.

Pendientes post-MVP además del portal cliente:

- Implementación real de los conectores MELI / ARCA / WhatsApp.
- E2E con Playwright para los flujos críticos (login → cotización → PDF → producción → stock).
- Bus de eventos cuando crezca el equipo.

### Criterio de aceptación de Fase 3 (validación contra Excel)

Tests automáticos que cargan los parámetros y la receta del cuaderno A5 desde el Excel y verifican que `CostingEngine.compute(producto)` devuelve **exactamente** los mismos números que la hoja "📓 Base A5 (8 discos)":

- E10 (subtotal filamento), E12 (con desperdicio), E15 (hojas), E21 (hora máquina), E26 (mano de obra), E29 (marketing), E38 (costo total), E41 (con provisiones), E50/E58/E66 (precios por canal).

---

## 7. Estándares de Desarrollo

- **Branching**: `main` protegida, features en `feat/*`, PRs obligatorios.
- **Commits**: convencional (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- **Lint/format**: ESLint + Prettier compartidos vía `tsconfig.base.json` y `.prettierrc`.
- **Tipos**: `strict: true`, sin `any` salvo justificación documentada.
- **Validación**: nunca confiar en el cliente; todas las entradas validan Zod en el back.
- **Errores**: `HttpExceptionFilter` global con respuesta `{ code, message, details? }` consistente.
- **Logs**: `pino` estructurado, request-id por petición.
- **Tests**: cobertura mínima 80% en `pricing/` y `costing/`. E2E para flujos críticos.
- **Migraciones**: nunca editar una migración aplicada; siempre crear una nueva.
- **Secretos**: `.env` jamás en git; `.env.example` versionado.
- **Permisos**: cada endpoint protegido declara `@Permissions('quote:create')` etc.

---

## 8. Dockerización

### docker-compose.yml (prod-like)

3 servicios: `db` (Postgres 16 con volumen persistente), `api` (Node 20-alpine, build multistage), `web` (Next.js standalone build, sirve en :3000). Red interna `tienda3d_net`. Healthchecks para los 3.

### docker-compose.override.yml (dev)

Monta el código como volumen, comando `pnpm dev` en cada servicio, expone puertos para HMR (3000, 3001), agrega `pgadmin` opcional.

### Variables de entorno (`.env`)

```
POSTGRES_USER=tienda3d
POSTGRES_PASSWORD=changeme
POSTGRES_DB=tienda3d
DATABASE_URL=postgresql://tienda3d:changeme@db:5432/tienda3d?schema=public

API_PORT=3001
API_JWT_SECRET=changeme
API_JWT_EXPIRES_IN=15m
API_REFRESH_SECRET=changeme
API_REFRESH_EXPIRES_IN=7d

WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Plan de migración a AWS

- **DB**: `db` → RDS PostgreSQL 16. Backup diario, multi-AZ a futuro.
- **API**: imagen a ECR, deploy en ECS Fargate (o EC2 + systemd al inicio).
- **Web**: build estático/standalone en EC2 o ECS, CloudFront delante.
- **Storage**: S3 para imágenes de productos y PDFs generados.
- **Secrets**: AWS Secrets Manager.
- **CI/CD**: GitHub Actions con OIDC hacia AWS.

---

## 9. Roles y Permisos (RBAC dinámico)

Al hacer seed se crean 3 roles base + permisos atómicos (e.g. `material:read`, `material:write`, `quote:create`, `quote:export`, `parameter:write`, `production:execute`, `user:manage`). Desde `/admin/roles` un admin puede:

- Crear/editar roles.
- Asignar/quitar permisos por checkbox.
- Cambiar el rol de un usuario.

Roles iniciales:

- **admin** — todos los permisos.
- **operator** — todo excepto `parameter:write`, `user:manage`, `role:manage`.
- **viewer** — solo `*:read`.

A futuro: rol `customer-wholesale-tier-N` (vinculado al portal cliente).

---

## 10. Riesgos y Mitigación

| Riesgo | Mitigación |
|---|---|
| Discrepancia de cálculos vs. Excel | Tests automáticos contra valores fijos del Excel en Fase 3. |
| Sobre-ingeniería temprana | Monolito modular, sin microservicios ni event-bus hasta que duela. |
| Cambio frecuente de proveedores/precios | Histórico inmutable + `is_current` editable; nunca pisar valores. |
| Fricción al cargar productos con muchas piezas | UX con auto-cálculo en vivo, plantillas, duplicar producto. |
| Migración a modelo tributario fino dolorosa | Campos preparados desde día 1, estrategia intercambiable. |
| Pérdida de datos local (taller) | Backups automáticos del volumen Postgres en script + recordatorio. |

---

## 11. Entregables al Cierre del MVP

1. Repositorio con `docker compose up` funcional en una sola línea.
2. `PLAN.md` (este documento) actualizado.
3. README con guía de instalación, seeding y restore.
4. Tests verdes (unitarios, integración, E2E críticos).
5. Datos seed: parámetros del Excel, máquina Bambu A1, filamentos PLA típicos, productos demo.
6. Roles y usuario admin inicial.
7. Plan de migración a AWS documentado.

---

_Documento vivo. Cualquier cambio de alcance se refleja acá antes de tocar código._
