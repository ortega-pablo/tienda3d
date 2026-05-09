# Plan: Tipos de cliente y pricing personalizado

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza para que el proceso
> sea retomable.

## Contexto

Hoy el sistema asume un único perfil de cliente: el comprador puntual que ve
los precios de los canales activos del producto y la escala que corresponda a
la cantidad. El usuario tiene en realidad **cuatro perfiles** distintos:

| Tipo | Descripción | Diferencia clave vs estándar | Catálogo |
|---|---|---|---|
| **Estándar** | Compra puntual, una vez. | Ninguna — caso ya cubierto. | Todos los productos activos. |
| **Mayorista** | Compras recurrentes mensuales. | Piso de tier + compromiso de volumen, **ambos por categoría asociada**. | Filtrado por las categorías que tiene asociadas. |
| **Consignación** | Revende los productos. | Sin comisión de canal y sin marketing prorrateado. | Todos los productos activos. |
| **Especial** | Trato caso a caso. | Descuentos arbitrarios (canal, marketing, régimen, reinversión). | **Productos puntuales** asignados manualmente. |

Y a futuro: **portal de clientes** donde cada uno puede entrar a ver su
catálogo personalizado y generar pedidos.

## Decisiones acordadas

1. **Categorías de productos** con jerarquía de **2 niveles**: categoría
   padre (ej. "Lámparas") + subcategoría (ej. "Lámparas de mesa", "Lámparas
   de pie", "Lámparas colgantes"). Tres niveles o más quedan fuera de
   alcance — si en el futuro hace falta, se migra el modelo.
2. **Mayorista** = piso de tier permanente **+** tracking mensual,
   **ambos por categoría asociada**. Si en un mes no cumple la cantidad
   mínima comprometida en una categoría, el sistema **suspende
   automáticamente** el mayoreo de **esa categoría** el mes siguiente
   (las otras categorías siguen activas si cumplió). Para reactivar,
   el admin levanta la suspensión manualmente.
3. **Compromiso heterogéneo resuelto por categoría**: "20 lámparas" y
   "20 llaveros" son compromisos distintos. Cada categoría asociada al
   cliente lleva su propio `monthlyCommitmentQty` y `minTierQty`. No hay
   un compromiso global.
4. **Catálogo del mayorista**: solo ve productos cuya `category` (o
   `category.parent`) está entre sus categorías asociadas. Si tiene asociada
   la categoría padre "Lámparas", ve también las subcategorías de Lámparas.
5. **Especial**: catálogo se define por **productos puntuales** asignados
   (no por categorías). Se mantiene el modelo `CustomerProduct`.
6. **Portal de clientes**: doble modalidad. Cada cliente lleva un flag
   `hasPortalAccess`. Los que lo tengan en `true` reciben credenciales y se
   loguean en `/portal` con permisos limitados; los que no, son entidades
   pasivas (registros internos sobre los que el staff genera cotizaciones).
7. **Consignación**: además de quitar la comisión de canal, también se
   descuenta el **marketing prorrateado**. Régimen y reinversión se mantienen.
8. **Cliente STANDARD = walk-in, NO se persiste** como `Customer`. Las
   cotizaciones de un cliente puntual siguen guardando `customerName /
   customerEmail / customerPhone` como strings libres (igual que hoy).
   El panel de clientes solo gestiona WHOLESALE, CONSIGNMENT y SPECIAL.
9. **1 cliente = 1 usuario de portal**. Cada `Customer` con
   `hasPortalAccess = true` tiene un único `User` asociado. Si el
   negocio del cliente tiene varias personas, comparten credenciales.
10. **Pedido del portal → `Quote` con `status = SENT`** directo. El
    cliente "envía" el pedido y el staff lo recibe ya marcado como enviado;
    decide aceptar o rechazar. Notificación por email al staff cuando llega.
11. **Canal del portal**: cada cliente con portal lleva un
    `defaultChannelId` (ej. "Venta Directa" o un canal "Mayorista
    transferencia" que crees a propósito). El motor usa ese canal cuando
    el cliente cotiza desde el portal.
12. **Histórico del cliente** muestra: cotizaciones, volúmenes mensuales por
    categoría, suspensiones/reactivaciones de mayoreo y audit log de
    cambios de configuración.

## Glosario

- **`Customer`**: entidad nueva. Distinta de `User` (= staff). Un usuario
  puede o no tener cuenta de portal.
- **`CustomerType`** (preset): `STANDARD | WHOLESALE | CONSIGNMENT | SPECIAL`.
  Define defaults de las flags; cada flag puede sobrescribirse por cliente.
- **`Category`**: categoría de productos. Jerarquía de 2 niveles: padre
  (`parentId = null`) o subcategoría (`parentId != null`). El producto se
  asocia a una categoría hoja (subcategoría) o a una categoría padre si no
  hay subdivisión.
- **`CustomerCategoryCommitment`**: relación `(customer, category)` con piso
  de tier y compromiso de volumen mensual de **esa categoría específica**.
  Reemplaza el `minTierQty` y `monthlyCommitmentQty` globales por cliente.
  La suspensión también vive acá (es por categoría, no por cliente).
- **Pricing flags** (booleanos por cliente):
  - `skipChannelCommission` — fuerza comisión 0 sin importar el canal.
  - `skipMarketing` — quita el marketing del proceso (recalcula `fabricationPrice`).
  - `skipRegime` — fuerza régimen 0 (ya pasa hoy con CASH; acá se generaliza).
  - `skipReinvestment` — quita el 10% de reinversión (caso extremo, casi solo SPECIAL).
- **Tier piso (`minTierQty`)**: piso permanente para una categoría
  específica del mayorista. Si la cantidad real es menor al piso, el motor
  igual aplica el markup de la tier que cubre `minTierQty`.
- **Compromiso mensual (`monthlyCommitmentQty`)**: meta de unidades/mes que
  el cliente se compromete a comprar **dentro de una categoría** para
  mantener el mayoreo en esa categoría. Se trackea por mes calendario.

---

## Fase 0 — Sistema de categorías de productos

Pre-requisito de todo lo demás (porque el catálogo del mayorista y el
compromiso del mismo se definen por categoría).

### Schema

```prisma
model Category {
  id        String     @id @default(cuid())
  name      String
  slug      String     @unique
  icon      String?    // emoji o nombre de icono lucide
  parentId  String?
  parent    Category?  @relation("CategoryParent", fields: [parentId], references: [id], onDelete: Restrict)
  children  Category[] @relation("CategoryParent")
  isActive  Boolean    @default(true)
  sortOrder Int        @default(0)
  notes     String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  products Product[]
  customerCommitments CustomerCategoryCommitment[]

  @@index([parentId])
  @@index([isActive, sortOrder])
  @@map("categories")
}
```

**Restricciones de negocio (validadas en service layer)**:

- Una categoría con `parentId != null` (subcategoría) **no puede tener
  hijos**: bloquea la jerarquía a 2 niveles.
- No se puede borrar una categoría que tenga productos asignados
  (soft-delete vía `isActive = false` en su lugar).
- No se puede borrar una categoría padre que tenga subcategorías activas.

### Modificación a `Product`

```prisma
model Product {
  // ... campos existentes
  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id])

  @@index([categoryId])
}
```

`categoryId` es opcional para no obligar a categorizar los productos
existentes en la migración. Productos sin categoría se muestran a clientes
STANDARD y CONSIGNMENT, pero **no** a mayoristas (porque sus filtros son
inclusivos: "muestrame solo productos en mis categorías").

### Migración

- [ ] Crear migración `categories`:
  - `CREATE TABLE "categories" ...`
  - `ALTER TABLE "products" ADD COLUMN "categoryId" TEXT NULL;` + FK + índice.
- [ ] Seed de categorías iniciales (opcional): "Lámparas" + subcategorías
  típicas, basado en lo que tenga el negocio hoy.
- [ ] Backfill manual: el admin asigna `categoryId` a los productos
  existentes desde el UI (Fase 0 también incluye el UI).

### Backend

- [ ] `categories.module.ts` + `categories.service.ts` +
  `categories.controller.ts`:
  - `GET /categories` — árbol de 2 niveles con productos contados por
    categoría. Filtros: `?activeOnly=true`, `?withProducts=true`.
  - `GET /categories/:id` — detalle.
  - `POST /categories` — crear (valida regla de 2 niveles).
  - `PATCH /categories/:id` — editar.
  - `DELETE /categories/:id` — borra si está vacía; sino soft-delete.
- [ ] Permisos: `category:read`, `category:write` (typical).

### UI staff

- [ ] `apps/web/src/app/(protected)/categorias/page.tsx`:
  - Árbol expandible: padre → subcategorías.
  - Cada nodo muestra: nombre, ícono, # productos, sortOrder, toggle activo.
  - Botones por nodo: editar, agregar subcategoría (solo si es padre),
    eliminar.
  - Reordenamiento por drag-and-drop (opcional, simple subir/bajar
    también sirve si DnD es complejo).
- [ ] Dialog `category-dialog.tsx`: nombre, slug (auto-generado editable),
  ícono (selector con preview), parent (combobox; deshabilitado si está
  editando una categoría con hijos), notas.
- [ ] Integración en `product-editor.tsx`: combobox de categoría agrupado
  por padre (ej. *Lámparas → Lámparas de mesa, Lámparas de pie...*).
- [ ] Filtro por categoría en `/productos` (lista).

### Validaciones nuevas en el editor de productos

**Independientes de categorías** pero parte del mismo bloque de mejoras al
editor. Se incluyen acá para no fragmentar la fase.

- [ ] Form arranca **vacío** (sin pieza inicial). El estado actual crea una
      pieza vacía por default — eso cambia. UX: se muestran dos botones
      grandes "Agregar pieza impresa" y "Agregar insumo" cuando el producto
      no tiene ninguno.
- [ ] **Regla de validación**: el producto debe tener **al menos 1 pieza
      O 1 insumo**. Si no tiene ninguno, el botón "Guardar" queda
      deshabilitado con tooltip *"Agregá al menos una pieza impresa o un
      insumo"*.
- [ ] **Si tiene piezas impresas**, cada pieza requiere **todos sus
      campos**: nombre (no vacío), gramos (> 0), tiempo de impresión (> 0)
      y filamento default (no null). Hoy algunos campos eran opcionales —
      pasan a ser obligatorios. Validación tanto en frontend (Zod schema)
      como backend (`pieceSchema` en `products.controller.ts`).
- [ ] **Si tiene insumos**, cada insumo requiere su material (FK no null) y
      cantidad > 0. (Ya estaba; confirmar.)
- [ ] **Costo de un producto sin piezas**: el calculator ya lo soporta
      (filament total = 0, machine cost = 0). Verificar que no haya
      warnings espurios cuando `printMinutes = 0` y agregar un test
      "producto solo con insumos calcula bien".
- [ ] **UI**: indicar visualmente la sección requerida (asterisco ★) en
      "Piezas impresas" y "Insumos" si no hay ninguna de las dos.

### Tareas backend para las validaciones

- [ ] `apps/api/src/modules/products/products.controller.ts` —
      `pieceSchema` con `name min(1)`, `grams.positive()`,
      `printMinutes.positive()`, `defaultFilamentId` no nullable.
- [ ] `inputSchema` con un `.refine()` global:
      `pieces.length > 0 || materials.length > 0` con mensaje
      *"El producto debe tener al menos una pieza impresa o un insumo"*.
- [ ] Tests `products.service.spec.ts` (si existe; sino crear) cubriendo
      ambos casos: solo piezas, solo insumos, ambas, ninguna (debe fallar).

---

## Fase 1 — Modelo de datos (Schema + migración)

### Tabla `Customer`

```prisma
enum CustomerType {
  STANDARD
  WHOLESALE
  CONSIGNMENT
  SPECIAL
}

enum CustomerSuspensionReason {
  MONTHLY_COMMITMENT_MISSED
  MANUAL_ADMIN
}

model Customer {
  id          String       @id @default(cuid())
  name        String
  type        CustomerType @default(STANDARD)
  email       String?      @unique
  phone       String?
  taxId       String?      // CUIT/CUIL para facturación
  notes       String?
  isActive    Boolean      @default(true)

  // Pricing flags (defaults los setea el preset al crear; el admin override).
  skipChannelCommission Boolean @default(false)
  skipMarketing         Boolean @default(false)
  skipRegime            Boolean @default(false)
  skipReinvestment      Boolean @default(false)

  /// Canal por defecto para los pedidos generados desde el portal del
  /// cliente. Recomendado para WHOLESALE/CONSIGNMENT (ej. canal
  /// "Mayorista transferencia"). Si null, el portal pide elegir canal
  /// al crear el pedido (fallback).
  defaultChannelId String?
  defaultChannel   Channel? @relation(fields: [defaultChannelId], references: [id])

  // Portal
  hasPortalAccess Boolean @default(false)
  portalUserId    String? @unique  // FK al User cuando se le crea cuenta

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relaciones
  /// Solo se popula para SPECIAL. Productos puntuales que el cliente puede comprar.
  allowedProducts        CustomerProduct[]
  /// Solo se popula para WHOLESALE. Categorías asociadas + sus pisos y compromisos.
  categoryCommitments    CustomerCategoryCommitment[]
  monthlyVolumes         CustomerMonthlyVolume[]
  quotes                 Quote[]

  @@index([type, isActive])
  @@map("customers")
}
```

> **Nota**: el piso de tier, el compromiso mensual y la suspensión **dejan
> de vivir en `Customer`** (como estaba en la versión anterior del plan) y
> se mueven a `CustomerCategoryCommitment` para que sean granulares por
> categoría. Un cliente WHOLESALE con 3 categorías tiene 3 rows de
> compromiso, cada uno suspendible independientemente.

> **Sobre `CustomerType.STANDARD`**: el enum lo mantiene por flexibilidad
> futura, pero en el flujo MVP **no se persiste** ningún Customer con
> este tipo. Las cotizaciones de clientes puntuales siguen guardando
> `customerName/email/phone` como strings libres en `Quote` (compat con
> el comportamiento actual). El panel `/clientes` solo lista WHOLESALE,
> CONSIGNMENT y SPECIAL.

### Tabla `CustomerProduct` (catálogo de cliente SPECIAL)

Many-to-many. **Solo se usa para clientes SPECIAL**: define los productos
puntuales que ese cliente puede comprar. Si la lista está vacía, no puede
comprar nada (no es default permisivo, es explícito).

Para WHOLESALE el catálogo se filtra por `CustomerCategoryCommitment` (ver
abajo). Para STANDARD y CONSIGNMENT el catálogo es todos los productos
activos.

```prisma
model CustomerProduct {
  customerId String
  productId  String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  /// Override de markup específico para este cliente sobre este producto (opcional).
  customMarkupPct Decimal? @db.Decimal(6, 2)
  notes      String?

  @@id([customerId, productId])
  @@map("customer_products")
}
```

### Tabla `CustomerCategoryCommitment` (mayorista por categoría)

Reemplaza el viejo `Customer.minTierQty / monthlyCommitmentQty / isWholesaleSuspended`
global. Cada cliente WHOLESALE tiene una row por categoría asociada, con
**su propio piso de tier, compromiso de volumen y estado de suspensión**.

```prisma
model CustomerCategoryCommitment {
  id          String   @id @default(cuid())
  customerId  String
  categoryId  String
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  category    Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  /// Piso de tier para productos de esta categoría (null = sin piso).
  minTierQty           Int?
  /// Meta de unidades/mes en esta categoría (null = sin compromiso).
  monthlyCommitmentQty Int?

  /// Estado de mayoreo en esta categoría.
  isWholesaleSuspended Boolean                   @default(false)
  suspensionReason     CustomerSuspensionReason?
  suspendedAt          DateTime?

  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([customerId, categoryId])
  @@index([categoryId])
  @@map("customer_category_commitments")
}
```

**Reglas de negocio**:

- Un cliente puede tener N rows (1 por categoría asociada). Si tiene 0
  rows y el `type = WHOLESALE`, su catálogo está vacío y no recibe
  beneficios de mayoreo.
- La categoría asociada puede ser padre o subcategoría:
  - Si asociás "Lámparas" (padre) → ve todas las subcategorías de Lámparas.
  - Si asociás solo "Lámparas de mesa" (subcategoría) → ve solo esa.
- Si está asociado a una categoría padre Y a una subcategoría hija de la
  misma, **gana la regla más específica** para el compromiso (la
  subcategoría se trackea aparte; la padre cubre el resto).
- La suspensión es por categoría. Un cliente con 3 categorías y 1
  suspendida sigue teniendo mayoreo en las otras 2.

### Tabla `CustomerMonthlyVolume`

Snapshot por **cliente × categoría × mes** para tracking del compromiso.
Se actualiza cuando una cotización con `customerId` cambia a estado
`ACCEPTED`: para cada item, se busca la categoría del producto y se
incrementa el volumen del mes.

```prisma
model CustomerMonthlyVolume {
  id          String   @id @default(cuid())
  customerId  String
  /// Categoría a la que pertenece el volumen. Si el producto está en una
  /// subcategoría, se imputa también a la categoría padre asociada al
  /// cliente (si existe).
  categoryId  String
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  category    Category @relation(fields: [categoryId], references: [id])

  /// Primer día del mes (UTC). Truncar al inicio del mes al insertar.
  monthStart   DateTime
  unitsSold    Decimal  @default(0) @db.Decimal(14, 2)
  /// Snapshot del compromiso al momento del cierre, para auditoría.
  committedQty Int?
  /// True si al cerrar el mes no llegó al compromiso.
  unfulfilled  Boolean  @default(false)

  @@unique([customerId, categoryId, monthStart])
  @@index([monthStart])
  @@map("customer_monthly_volumes")
}
```

**Imputación cuando una sub y su padre están ambas asociadas**: se imputa
solo al row más específico (la subcategoría). Esto evita doble conteo. Si
solo el padre está asociado, se imputa a la padre.

### Modificaciones a tablas existentes

**`Quote`**:

```prisma
model Quote {
  // ... campos actuales
  customerId String?    // FK opcional al cliente
  customer   Customer?  @relation(fields: [customerId], references: [id])
  // El cliente actual usa customerName/customerEmail/customerPhone/customerNotes
  // como campos free-form. Cuando customerId está, esos campos se completan
  // del Customer asociado pero quedan persistidos en el snapshot.
}
```

**`User`**:

```prisma
model User {
  // ... campos actuales
  /// Si el usuario es de tipo "customer portal" (no staff), apunta al Customer.
  customerId String?  @unique
  customer   Customer? @relation("UserAsCustomer", fields: [customerId], references: [id])
}
```

> **Decisión clave**: reusamos `User` para la auth del portal en vez de crear
> una tabla separada `CustomerUser`. Pros: aprovechamos toda la infra de
> auth/JWT/refresh tokens. Contras: hay que segregar staff vs customer en los
> endpoints (un guard nuevo `@CustomerOnly` o un check de `roleId`).

### Migración

- [ ] Crear migración `20260YYYYMMHHMM_customers`:
  - `CREATE TYPE "CustomerType" ...`
  - `CREATE TABLE "customers" ...`
  - `CREATE TABLE "customer_products" ...`
  - `CREATE TABLE "customer_monthly_volumes" ...`
  - `ALTER TABLE "quotes" ADD COLUMN "customerId" TEXT;`
  - `ALTER TABLE "users" ADD COLUMN "customerId" TEXT;` + unique.
  - FKs con `ON DELETE` apropiado.
- [ ] Permisos nuevos en seed:
  - `customer:read`, `customer:write`, `customer:portal:manage` (staff).
  - `portal:catalog:read`, `portal:order:create` (rol nuevo `customer-portal`).
- [ ] Rol `customer-portal` con permisos mínimos del portal.

---

## Fase 2 — Motor de pricing customer-aware

### Extensión de `PricingCostInputs` y `PricingEngine.price()`

El motor recibe un nuevo input opcional `customer`:

```ts
interface CustomerPricingProfile {
  skipChannelCommission: boolean;
  skipMarketing: boolean;
  skipRegime: boolean;
  skipReinvestment: boolean;
  /** Override de markup que pisa al del producto y al de la tier. */
  customMarkupPct?: number;
  /** Tier piso: el motor calcula el `markupPct` como si la cantidad fuera al menos esto. */
  minTierQty?: number;
}
```

### Recálculo de `fabricationPrice` cuando hay `skipMarketing` / `skipReinvestment`

Estos flags afectan el **costo de fabricación**, no solo el motor. El servicio
de pricing debe recalcular:

```
process_eff = filament_with_reab + machine + labor_eff + (skipMarketing ? 0 : marketing)
fabrication_eff = process_eff × (1 + contingency% + (skipReinvestment ? 0 : reinvestment%))
```

Como `costing.calculator.compute()` ya devuelve los componentes por separado,
basta con que `pricing.service.forProduct()` los recombine cuando hay un
profile activo. **No hace falta tocar el calculator**.

### Recálculo de comisión y régimen

```
commission_eff = customer.skipChannelCommission ? 0 : commission_normal
regime_eff     = customer.skipRegime           ? 0 : regime_normal
```

Régimen para CASH ya es 0 hoy. El nuevo flag generaliza la regla a cualquier
canal cuando el cliente lo justifique (ej. consignación a un mayorista
inscripto en otro régimen).

### Resolución de markup con tier piso

El piso ahora es **por categoría**: el motor primero busca la
`CustomerCategoryCommitment` que matchea con la categoría del producto
que se está cotizando.

```
commitment = customer.categoryCommitments.find(c =>
  c.categoryId === product.categoryId
  || c.categoryId === product.category.parentId
)

// Si la categoría asociada está suspendida, ignora el piso (cliente paga al precio público).
floor      = (commitment && !commitment.isWholesaleSuspended)
             ? (commitment.minTierQty ?? 0)
             : 0

applicable_qty = max(quantity, floor)
tier           = tiers.find(t => applicable_qty in [t.minQty, t.maxQty])

// Resolver markup con el orden de precedencia documentado en convenciones.
markup = customerProduct.customMarkupPct      // SPECIAL con override
      ?? tier.markupPct                       // tier resuelta con piso
      ?? product.targetMarkupPct
```

### Resolución del catálogo visible

El motor también determina **si un cliente puede comprar un producto**:

```
canBuy(customer, product):
  switch (customer.type) {
    case STANDARD:    return product.isActive
    case CONSIGNMENT: return product.isActive
    case SPECIAL:     return product.isActive
                          && customer.allowedProducts.has(product.id)
    case WHOLESALE:   return product.isActive
                          && product.categoryId != null
                          && customer.categoryCommitments.some(c =>
                               c.categoryId === product.categoryId
                               || c.categoryId === product.category.parentId
                             )
  }
```

### Nuevo endpoint: `/customers/:id/products/:productId/prices`

Calcula los precios del producto **para ese cliente específico**, aplicando
el profile completo. Útil para:
- Vista staff: matriz "precio para Juan" antes de armar una cotización.
- Portal de clientes: el cliente solo ve sus precios.

### Tareas

- [ ] `pricing.types.ts`: agregar `CustomerPricingProfile` y extender
      `PricingCostInputs` para aceptar overrides de fabricación.
- [ ] `pricing.engine.ts`: aplicar flags en `resolveCommission`,
      `computeTaxes`, y resolver `markupPct` con `customMarkupPct` y
      `minTierQty`.
- [ ] `pricing.service.ts`:
  - `forCustomerProduct(customerId, productId)` — nuevo método que carga el
    customer profile, recombina el costo según flags, y delega al engine.
  - El método existente `forProduct(productId)` queda intacto (caso staff sin
    cliente seleccionado).
- [ ] Tests `pricing.engine.spec.ts`:
  - `skipMarketing`: fabricationPrice baja; profit baja proporcionalmente.
  - `skipChannelCommission`: el precio neto baja al perder la deducción.
  - `minTierQty`: comprando 1 unidad con piso=5 da el precio de la tier 5-9.
  - `customMarkupPct`: pisa a la tier y al producto.
  - Combinaciones (consignación = skipChannelCommission + skipMarketing).

---

## Fase 3 — UI staff: gestión de clientes (`/clientes`)

### Estructura

- [ ] `apps/web/src/app/(protected)/clientes/page.tsx` — lista de clientes con
      filtros (tipo, activo, suspendido, con compromiso vencido).
- [ ] `apps/web/src/app/(protected)/clientes/nuevo/page.tsx` — alta.
- [ ] `apps/web/src/app/(protected)/clientes/[id]/page.tsx` — detalle:
  - **Datos básicos** (nombre, contacto, fiscal).
  - **Tipo + flags** (con presets que setean defaults pero permiten overrides
    individuales).
  - **Mayorista** (visible solo si `type = WHOLESALE`):
    - Lista de **categorías asociadas** con CRUD inline. Por cada
      categoría asociada se muestra/edita:
      - Selector de categoría (combobox agrupado padre → hijas).
      - `minTierQty` por categoría (selector de tier).
      - `monthlyCommitmentQty` por categoría.
      - Estado: badge "Activo" (verde) o "Suspendido" (rojo) con motivo
        y fecha. Botón "Levantar suspensión" si aplica (solo admin).
    - Botón "Agregar categoría asociada" para crear una nueva row.
    - Tabla histórica de `CustomerMonthlyVolume`: por categoría × mes,
      unidades vendidas, compromiso, ¿cumplió?
  - **Productos asignados** (visible solo si `type = SPECIAL`):
    - Multiselect de productos activos.
    - Por cada producto, opcional: `customMarkupPct` (override individual).
    - Aclaración: este cliente solo verá los productos seleccionados.
  - **Portal**:
    - Toggle `hasPortalAccess`.
    - Botón "Crear cuenta de portal" → genera User con role `customer-portal`,
      muestra credenciales temporales una sola vez.
    - Botón "Restablecer contraseña" / "Bloquear acceso".

### Patrón de edición

Mantener el `useEditMode` + `ConfirmDialog` + `toast` del resto del sistema.

### Vista rápida de precios "para este cliente"

En la página de detalle del cliente, agregar un botón **"Ver precios"** que
abre un dialog/sheet con la matriz de precios calculada para los productos
permitidos (o todos, si no está restringido), aplicando el profile completo.
Muestra para cada producto: precio por canal × tier, profit estimado,
comparativa contra precio "público" del producto.

### Histórico del cliente (4 secciones colapsables o pestañas)

En el detalle del cliente, debajo de la configuración, una sección
"Histórico" con cuatro vistas. Pestañas o acordeones — preferencia: pestañas
para que sea más rápido navegar.

#### a) Cotizaciones

- Tabla con todas las `Quote` del cliente: código, fecha, estado,
  monto, cantidad de items, profit total estimado.
- Filtros: estado, rango de fechas, tipo (PRODUCT vs ADHOC).
- Por row: link al detalle de la cotización, status badge.
- Footer: totales (cantidad de cotizaciones, monto acumulado, tasa de
  aceptación %).

#### b) Volúmenes mensuales

- Tabla por categoría asociada × mes (matriz). Filas: cada categoría
  asociada al cliente. Columnas: últimos 12 meses.
- Cada celda muestra: `unitsSold / committedQty` con color (verde si
  cumplió, rojo si no, gris si no había compromiso).
- Hover/tooltip: detalle del mes (cuántos pedidos, qué productos).
- Si el cliente no es WHOLESALE, esta pestaña no aparece.

#### c) Suspensiones y reactivaciones

- Timeline o tabla con cada evento de suspensión:
  - Categoría afectada, fecha de suspensión, motivo
    (`MONTHLY_COMMITMENT_MISSED` o `MANUAL_ADMIN`).
  - Si se reactivó: fecha, actor, notas.
- Estado actual: badge resumiendo "X de Y categorías activas".

#### d) Cambios de configuración (audit log filtrado)

- Tabla cronológica con cambios sobre el cliente:
  - `Customer` (cualquier campo): tipo, flags, productos asignados,
    categorías asociadas, defaults.
  - `CustomerCategoryCommitment`: `minTierQty`, `monthlyCommitmentQty`.
  - `CustomerProduct`: agregados / removidos.
- Cada fila: actor (quién), fecha, qué cambió (diff antes/después).
- Reusa la tabla `AuditLog` existente, filtrada por
  `entity in ('Customer', 'CustomerCategoryCommitment', 'CustomerProduct')`
  y `entityId in [...los IDs relacionados al cliente]`.

### Auditoría de cambios

Para que la pestaña (d) funcione, hay que asegurar que **todos los cambios
sobre las entidades del cliente** generen entradas en `AuditLog`:

- [ ] `customers.service.ts`: en cada `update()`, comparar antes vs
      después y crear audit con before/after.
- [ ] Mismo para `customer-category-commitments.service.ts` y
      `customer-products.service.ts`.
- [ ] La cron de cierre mensual (Fase 5) ya genera audit cuando suspende.

### Tareas

- [ ] Backend: `customers.controller.ts` con CRUD + listar productos
      permitidos + togglear suspensión + crear cuenta portal.
- [ ] Frontend: páginas `/clientes` (list, new, detail).
- [ ] Componente `CustomerProductMatrix` reutilizable que pinta la matriz de
      precios.

---

## Fase 4 — Cotizaciones vinculadas a cliente

### Cambios en el flujo

- [ ] **Selector de cliente** en `nueva-producto` y `nueva-rapida`:
  - Combobox con búsqueda (los clientes pueden ser muchos).
  - Si se elige un cliente: autocompleta `customerName/email/phone/notes` y
    aplica el profile al cálculo de precio.
  - Si se deja vacío: comportamiento actual (cliente walk-in).
- [ ] **Restricción de catálogo**: si el cliente seleccionado tiene productos
      permitidos definidos, el selector de productos solo lista esos.
- [ ] **Preview** muestra el profile aplicado: badge "Mayorista (piso tier
      5-9)", "Consignación (sin canal, sin marketing)", etc.
- [ ] **Detail page** de la cotización aceptada actualiza el contador
      `CustomerMonthlyVolume` para el mes correspondiente.

### Snapshot histórico

Las cotizaciones siguen guardando `unitCost / unitPrice / unitProfit` como
snapshot. **Además**, cuando hay `customerId`, persistir un snapshot del
profile aplicado (JSON) para que la cotización sea reproducible aunque después
cambien las reglas del cliente:

```prisma
model Quote {
  // ...
  customerId             String?
  /// Snapshot del CustomerPricingProfile al momento de crear (JSON).
  customerProfileSnapshot Json?
}
```

### Tareas

- [ ] Schema: agregar `customerId` y `customerProfileSnapshot` a `Quote`
      (parte de la migración Fase 1).
- [ ] `quotes.service.ts`:
  - Aceptar `customerId` opcional en el input de creación.
  - Cargar el profile, validar productos permitidos, persistir snapshot.
  - Al cambiar a `ACCEPTED`: incrementar `CustomerMonthlyVolume` del mes en
    curso para ese cliente.
- [ ] Frontend: combobox en los dos formularios + chip que muestra el
      profile aplicado.

---

## Fase 5 — Cierre mensual + suspensión automática del mayoreo

### Cron / job mensual

- [ ] Endpoint protegido `POST /customers/cron/monthly-close` (o cron vía
      NestJS `@Cron`) que se ejecuta el día 1 de cada mes a las 03:00 ART:
  1. Por cada `CustomerCategoryCommitment` con `monthlyCommitmentQty != null`
     y cuyo cliente esté activo:
  2. Tomar el `CustomerMonthlyVolume` correspondiente
     `(customerId, categoryId, monthStart = mes recién cerrado)`.
  3. Si `unitsSold < monthlyCommitmentQty`:
     - Marcar `unfulfilled = true` en el volumen.
     - Setear `commitment.isWholesaleSuspended = true`,
       `suspensionReason = MONTHLY_COMMITMENT_MISSED`,
       `suspendedAt = now()`.
     - Generar entrada en `AuditLog` con `entity = 'CustomerCategoryCommitment'`.
  4. Crear el `CustomerMonthlyVolume` del nuevo mes con `unitsSold = 0` y
     `committedQty = commitment.monthlyCommitmentQty`.

> Nota: la suspensión es **por categoría**, no por cliente. Si un mayorista
> tiene 3 categorías asociadas y solo falla en 1, las otras 2 siguen
> activas con su mayoreo.

### Comportamiento de la suspensión

- Cuando `commitment.isWholesaleSuspended = true`, el motor de pricing
  **ignora** `commitment.minTierQty` para los productos de **esa categoría**
  (cliente paga el precio público de esos productos).
- Productos de otras categorías asociadas siguen con su mayoreo activo.
- Los flags globales del cliente (`skipMarketing`,
  `skipChannelCommission`, etc.) **siguen aplicándose** sin cambios — la
  suspensión solo neutraliza el piso de tier de la categoría afectada.
- En la UI del cliente aparece la categoría suspendida con badge rojo
  e indicación: "Mayoreo suspendido desde DD/MM por no cumplir compromiso
  (X / Y unidades)".
- En las cotizaciones, los productos de categorías suspendidas se cotizan
  al precio público — la UI lo señala con un ícono y tooltip.

### Reactivación manual

- [ ] Botón "Levantar suspensión" en el detail del cliente. Solo accesible
      con permiso `customer:write`.
- [ ] Acción: setea `isWholesaleSuspended = false`, `suspensionReason = null`,
      `suspendedAt = null`. Audit log con actor.

### Reportes

- [ ] Página `/clientes/reportes/compromisos`: tabla con todos los clientes
      mayoristas, mes actual, unidades vendidas vs comprometidas, % de
      cumplimiento, días restantes en el mes.
- [ ] Alerta dashboard: "X clientes mayoristas a menos del 50% del compromiso
      con menos de 7 días en el mes".

### Tareas

- [ ] Job/cron mensual en backend.
- [ ] Endpoint manual de cierre (para testing y para correr manualmente si
      el cron falla).
- [ ] Banner de suspensión en UI.
- [ ] Página de reportes de compromiso.

---

## Fase 6 — Catálogo personalizado por cliente (vista staff)

Vista pre-portal: el staff puede generar un PDF/link compartible con el
catálogo que el cliente vería, para enviárselo por mail antes de tener portal.

- [ ] Endpoint `GET /customers/:id/catalog` — devuelve productos permitidos
      con sus precios calculados aplicando el profile. JSON.
- [ ] Endpoint `GET /customers/:id/catalog.pdf` — versión PDF del catálogo
      con branding, listo para enviar.
- [ ] Página `/clientes/[id]/catalogo` — vista web idéntica al PDF para
      preview en navegador.

---

## Fase 7 — Portal de clientes (`/portal`)

Vista pública del cliente para ver su catálogo y generar pedidos. **1
cliente = 1 usuario** (decisión acordada). Toda cotización generada
desde el portal se persiste como `Quote` con `status = SENT`,
`customerId` poblado y un snapshot del profile.

### 7.1 Auth y onboarding

- [ ] **Rol `customer-portal`** con permisos:
  - `portal:catalog:read` — ver catálogo personalizado.
  - `portal:order:create` — generar pedido.
  - `portal:profile:edit` — editar datos propios y cambiar contraseña.
- [ ] **`User.customerId`** como FK con unique. Cuando este campo está
      poblado, el `User` no es staff sino "customer portal user".
- [ ] **Crear cuenta de portal** (desde detail del cliente — Fase 3):
  1. Admin clickea "Crear cuenta de portal" en el detail.
  2. Backend genera password temporal (random + token) y crea
     `User { roleId: customer-portal, customerId, isActive: true }`.
  3. Envía email al cliente con: link de bienvenida + token único de un
     solo uso para establecer su contraseña inicial.
  4. UI muestra al admin: "Cuenta creada. Email enviado a `<email>`."
     (sin mostrar la password en claro).
- [ ] **Reset de contraseña**:
  - Desde `/portal/login` → link "Olvidé mi contraseña" → envía email
    con token de reset (válido 1h).
  - Desde el detail del cliente (admin) → botón "Resetear contraseña"
    que invalida la actual y manda nuevo email.
- [ ] **Bloquear acceso**: admin puede setear `User.isActive = false`
      sin borrar el cliente.
- [ ] **Login en `/portal/login`** — página separada del staff con
      branding adecuado (logo + nombre del negocio, sin sidebar).
- [ ] **Guard nuevo `@CustomerOnly`** que rechaza staff y exige
      `user.customerId != null`. Inyecta `currentCustomer` resolviendo el
      `Customer` asociado.
- [ ] **Middleware de routing**:
  - User con `customerId` que entra a `/(protected)/...` (rutas staff) →
    redirect `/portal`.
  - Staff (sin `customerId`) que entra a `/portal/...` → redirect `/`.

### 7.2 Layout y branding

- [ ] **`apps/web/src/app/portal/layout.tsx`** — shell propio:
  - Header simple: logo + nombre del negocio + nombre del cliente +
    salir.
  - Navbar horizontal: Catálogo · Mis pedidos · Compromisos · Perfil.
  - Sin sidebar (es un usuario, no staff multi-rol).
- [ ] Theme reusa el mismo (light/dark) pero color primario podría
      diferenciarse para no confundirse con el panel staff.

### 7.3 Catálogo (`/portal/catalogo`)

- [ ] Listado de productos **filtrados según el tipo del cliente**:
  - WHOLESALE → solo productos en categorías asociadas (cuyo
    commitment NO está suspendido **o** sí está suspendido pero el
    cliente los puede ver al precio público).
  - CONSIGNMENT → todos los activos.
  - SPECIAL → solo los productos en `CustomerProduct`.
- [ ] **Filtros**:
  - Por categoría (chips o sidebar de categorías).
  - Por nombre (input search).
- [ ] **Card de producto**:
  - Imagen (si tiene) o placeholder.
  - Nombre + descripción corta.
  - Precio principal (con el `defaultChannelId` y la tier que
    corresponda a "1 unidad" + tier piso si aplica).
  - Si hay tiers, mostrar las distintas (ej. "1-4: $X · 5-9: $Y · 10+:
    $Z").
  - Botón "Agregar al pedido".
- [ ] **Ocultar costos y profit**: el cliente solo ve precio final. El
      backend filtra esos campos en la respuesta.
- [ ] **Banner contextual** si el cliente es WHOLESALE y tiene una
      categoría suspendida: *"Tu mayoreo en `<categoría>` está suspendido
      desde DD/MM. Esos productos se muestran al precio público."*

### 7.4 Carrito y generación de pedido (`/portal/pedido`)

- [ ] **Carrito** persistido en memoria del browser (localStorage). Items
      con qty editable, eliminar, total preliminar calculado en el cliente.
- [ ] **Ajuste por cantidad**: cuando el cliente cambia `qty` en un item,
      el carrito recalcula precio (haciendo un fetch al backend con la
      cantidad — el backend resuelve la tier correcta y devuelve el
      precio).
- [ ] **Página de checkout**:
  - Resumen del pedido (productos + cantidades + totales).
  - Notas para el staff (textarea opcional).
  - Recordatorio: "Este pedido se enviará al staff. Recibirás confirmación
    cuando lo aprueben."
- [ ] **Submit** → `POST /portal/orders`:
  - Backend valida que cada producto está permitido para el cliente.
  - Crea `Quote` con:
    - `customerId` poblado.
    - `channelId = customer.defaultChannelId` (si null, error 400 "El
      admin no configuró un canal por defecto, contactalo").
    - `customerProfileSnapshot` JSON con todas las flags y categorías
      del momento.
    - `status = SENT` directo.
    - `items` con `unitCost / unitPrice / unitProfit` calculados.
- [ ] **Notificación al staff**: email con link a la cotización + datos
      del cliente.
- [ ] **Confirmación al cliente**: pantalla "Pedido enviado, código
      Q-2026-0042" + email automático con resumen.

### 7.5 Mis pedidos (`/portal/pedidos`)

- [ ] Lista de cotizaciones del cliente, ordenada por fecha desc.
- [ ] Cada row: código, fecha, estado, total.
- [ ] Click → detalle del pedido (`/portal/pedidos/[id]`):
  - Items con sus precios snapshot.
  - Estado actual + history de transiciones (DRAFT → SENT → ACCEPTED…).
  - Si está en SENT y todavía no fue aceptado, botón "Cancelar pedido"
    (vuelve a DRAFT y notifica al staff).
- [ ] Filtros básicos: estado, rango de fechas.

### 7.6 Compromisos mensuales (`/portal/compromisos`)

**Solo visible para WHOLESALE**.

- [ ] Por cada categoría asociada, un card mostrando:
  - Categoría (con ícono).
  - Compromiso del mes: `X / Y` unidades (X vendido, Y comprometido).
  - Barra de progreso.
  - Días restantes en el mes.
  - Estado: "Activo" o "Suspendido (desde DD/MM)".
- [ ] Si está cerca del cierre y no llegó al compromiso: alerta visual
      (amarillo/rojo) "¡Te faltan N unidades para mantener el mayoreo!".
- [ ] Histórico de meses anteriores (acordeón).

### 7.7 Perfil (`/portal/perfil`)

- [ ] Datos del cliente (read-only excepto algunos):
  - Nombre, tipo, taxId — read-only (lo administra el staff).
  - Email, teléfono — editables (notifica al staff cuando se cambian).
- [ ] Cambiar contraseña: form con password actual + nueva + confirmación.
- [ ] Categorías asociadas (read-only) — para que el cliente sepa qué
      puede comprar.
- [ ] Cerrar sesión (también en el header).

### 7.8 Notificaciones por email

Provider: configurar uno (Resend, SendGrid, Postmark, SMTP simple). Para
el MVP, podría ser un transport simple con `nodemailer` y SMTP de Gmail/
mailtrap, y migrar a un provider serio cuando crezca el volumen.

- [ ] **Plantillas mínimas**:
  - Bienvenida al portal (token de primera contraseña).
  - Reset de contraseña.
  - Confirmación de pedido enviado (al cliente).
  - Pedido recibido (al staff).
  - Cotización aceptada/rechazada (al cliente).
  - Recordatorio mensual de compromiso (opcional, si quedan pocos días).
- [ ] Servicio `apps/api/src/modules/notifications/email.service.ts`
      desacoplado: envía mails con templates. Si el provider falla, no
      bloquea la operación principal — log con warning.
- [ ] Variables de entorno: `EMAIL_FROM`, `EMAIL_TRANSPORT`, credenciales.

### 7.9 Restricciones de seguridad

- [ ] Backend rechaza con 403 cualquier intento de un customer-portal
      user de:
  - Ver cotizaciones que no son suyas.
  - Ver detalles de productos no permitidos.
  - Acceder a endpoints de staff (`/api/products`, `/api/customers`,
    etc.) — el guard global lo cubre.
- [ ] Rate limiting por User: throttler estricto en `/api/portal/*`
      (ej. 30 req/min) para evitar scraping.
- [ ] Logs: toda acción del portal queda en `AuditLog` con `actorId`
      del User customer-portal.

### 7.10 Tareas backend

- [ ] Módulo `apps/api/src/modules/portal/`:
  - `portal.module.ts`
  - `portal.controller.ts` — endpoints: `GET /portal/catalog`,
    `GET /portal/products/:id`, `POST /portal/orders`,
    `GET /portal/orders`, `GET /portal/orders/:id`,
    `POST /portal/orders/:id/cancel`, `GET /portal/commitments`,
    `PATCH /portal/profile`, `POST /portal/profile/password`.
  - `portal.service.ts` — orquesta llamadas a costing/pricing con el
    profile del cliente y filtra el catálogo.
- [ ] Guards `@CustomerOnly` + `@Permissions('portal:...')` en cada
      endpoint.

### 7.11 Tareas frontend

- [ ] `apps/web/src/app/portal/layout.tsx`
- [ ] `apps/web/src/app/portal/login/page.tsx`
- [ ] `apps/web/src/app/portal/recuperar-password/page.tsx`
- [ ] `apps/web/src/app/portal/establecer-password/[token]/page.tsx`
- [ ] `apps/web/src/app/portal/catalogo/page.tsx`
- [ ] `apps/web/src/app/portal/catalogo/[productId]/page.tsx`
- [ ] `apps/web/src/app/portal/pedido/page.tsx` (carrito + checkout)
- [ ] `apps/web/src/app/portal/pedidos/page.tsx`
- [ ] `apps/web/src/app/portal/pedidos/[id]/page.tsx`
- [ ] `apps/web/src/app/portal/compromisos/page.tsx` (solo WHOLESALE)
- [ ] `apps/web/src/app/portal/perfil/page.tsx`
- [ ] Provider `CustomerPortalProvider` (similar a `UserProvider`,
      pero expone `currentCustomer` además del user).
- [ ] Carrito en `localStorage` con un hook `useCart()` simple.
- [ ] Componentes: `CatalogCard`, `OrderSummary`, `CommitmentProgress`.

---

## Riesgos y decisiones abiertas

| Riesgo / abierto | Mitigación / nota |
|---|---|
| Migración existente: clientes hoy son strings free-form en `Quote.customerName`. ¿Qué pasa con cotizaciones históricas? | Las viejas mantienen sus campos string sin `customerId`. Solo las nuevas usan el FK. |
| El profile del cliente cambia y afecta cotizaciones futuras pero no las viejas. | Resuelto con el `customerProfileSnapshot` en `Quote`. |
| Cliente con `customMarkupPct` por producto + tier override + minTierQty: orden de precedencia. | **Convención**: `customer.customMarkupPct (por producto, solo SPECIAL) > tier.markupPct (resuelta con minTierQty de la categoría correspondiente como piso) > product.targetMarkupPct`. |
| Productos sin categoría asignada. | No se muestran a mayoristas (filtro categoría es excluyente para WHOLESALE). Sí se muestran a STANDARD/CONSIGNMENT. SPECIAL los ve solo si están en `CustomerProduct`. |
| Mayorista asociado a categoría padre y subcategoría hija al mismo tiempo. | El compromiso/piso de la subcategoría aplica a sus productos; el de la padre aplica al resto de subcategorías de esa rama. Imputación de volumen: solo a la row más específica (evita doble conteo). |
| Cambiar la categoría de un producto que ya tiene volumen acumulado en `CustomerMonthlyVolume` del mes en curso. | El volumen ya imputado queda; los siguientes items se imputan a la nueva categoría. Documentar en UI ("cambiar categoría no recategoriza volumen ya facturado"). |
| Borrar una categoría con compromisos asociados. | Bloqueado por la FK `onDelete: Restrict`. El admin debe migrar los clientes a otra categoría primero o desactivarla (`isActive=false`). |
| Cliente del portal pierde la contraseña. | Flujo de "olvidé contraseña" por email — Fase 7. |
| Cliente envía pedido pero `customer.defaultChannelId` no está seteado. | El portal devuelve 400 con mensaje claro. UI bloquea el submit y pide contactar al staff. |
| Cliente cambia su email desde el portal — pierde acceso si no recuerda el nuevo. | El sistema persiste el viejo email durante 24h como "recovery email" para revertir. Alternativa: requiere confirmación por mail al viejo email antes de aplicar el cambio. |
| Carrito del portal se pierde al cerrar sesión. | localStorage por usuario. Si quiere persistencia entre dispositivos, requiere una tabla `Cart` (fuera de alcance MVP). |
| Tiempo entre que el cliente envía pedido y el staff lo procesa: cambian costos. | El `Quote` ya tiene snapshots de `unitCost / unitPrice / unitProfit` + `customerProfileSnapshot` al momento del envío. El staff acepta o ajusta. |
| Cliente con todas las categorías suspendidas. | Sigue viendo catálogo (al precio público), puede pedir, pero la UI le advierte que no tiene mayoreo activo. |
| Producto sin pieza ni insumo. | La nueva validación del editor lo bloquea (Fase 0). |
| Producto con piezas pero sin filamento default. | La nueva validación del editor lo bloquea (todos los campos de pieza son obligatorios). |
| Suspensión retroactiva: cliente acepta cotización el último día del mes y queda al borde del compromiso. | El cron corre el día 1; la cotización del último día ya cuenta para el mes que se cierra. |
| `CustomerMonthlyVolume` se suma cuando la cotización pasa a `ACCEPTED` o cuando se crea. | **Convención**: solo cuando pasa a `ACCEPTED`. Cancelaciones decrementan. |
| Una `CustomerCategoryCommitment` sin `monthlyCommitmentQty` (null) | No se trackea ni se suspende. Pero sí aplica el `minTierQty` si está seteado. Útil: "siempre paga mayorista pero sin compromiso de volumen". |
| ¿Qué pasa si el cliente WHOLESALE no tiene ninguna categoría asociada? | Su catálogo está vacío. La UI lo señala como advertencia al guardar. |

---

## Convenciones

- **`Customer` ≠ `Quote.customerName`**: el primero es la entidad persistente,
  el segundo es snapshot textual de la cotización (compatibilidad con
  registros viejos).
- **Flags vs presets**: el preset (`CustomerType`) setea los flags al crear
  el cliente. Después, los flags son la fuente de verdad — el preset queda
  como etiqueta informativa. Cambiar el preset NO recambia los flags
  automáticamente (el admin decide manualmente).
- **Catálogo del cliente** depende del tipo:
  - `STANDARD` y `CONSIGNMENT`: todos los productos activos.
  - `WHOLESALE`: filtrado por `CustomerCategoryCommitment`.
  - `SPECIAL`: solo los productos en `CustomerProduct`.
- **Categorías limitadas a 2 niveles** (padre → hijas). Restricción
  validada en service layer al crear/editar.
- **Suspensión es por categoría**, no por cliente. Vive en
  `CustomerCategoryCommitment.isWholesaleSuspended`.
- **Imputación de volumen mensual a la row más específica** cuando un
  cliente tiene asociadas tanto la padre como una subcategoría hija.
- **El profile se persiste en la cotización** para que sea reproducible.
- **Mes calendario UTC** para el tracking de compromisos: simple y consistente.

---

## Estado actual

- [x] Fase 0 — Categorías de productos + ajustes al editor (validaciones)
- [x] Fase 1 — Schema clientes + migración
- [x] Fase 2 — Motor de pricing customer-aware + tests
- [x] Fase 3 — UI staff `/clientes` (config + matriz de precios). Histórico queda como placeholder hasta Fase 4-5.
- [x] Fase 4 — Cotizaciones vinculadas a cliente (POST acepta customerId, profile aplicado al motor, snapshot persistido, tracking mensual al ACCEPTED)
- [x] Fase 5 — Cierre mensual + suspensión automática (cron + endpoint manual + histórico real + barra de progreso del mes)
- [x] Fase 6 — Catálogo personalizado (vista web + PDF)
- [ ] Fase 7 — Portal de clientes (auth + UI + carrito + email)

---

## Sugerencia de orden de ejecución

Recomendado por valor inmediato y dependencias mínimas:

1. **Fase 0** antes que nada: categorías son pre-requisito del filtrado
   del mayorista, y las validaciones del editor son una mejora puntual
   que no depende del resto. Esta fase es independiente y aporta valor
   por sí sola (catálogo organizado, filtros en `/productos`, mejor UX
   al crear productos).
2. **Fase 1 → 2 → 3 → 4** en bloque (MVP de "tipos de cliente"). Hace
   utilizable el sistema con clientes guardados, profile aplicado a
   precios, cotizaciones vinculadas, y panel staff completo (incluyendo
   histórico).
3. **Fase 6** después (catálogo PDF es útil para enviar por mail
   mientras no haya portal).
4. **Fase 5** una vez que tengas datos reales de uso por al menos 1 o 2
   meses, para calibrar bien la lógica de suspensión antes de
   automatizarla.
5. **Fase 7** al final, cuando los flujos staff estén estables y haya
   clientes que pidan autoservicio. Es la fase más grande — considerar
   subdividirla en 7.A (auth + catálogo) y 7.B (carrito + pedidos +
   compromisos + email) si querés releases incrementales.
