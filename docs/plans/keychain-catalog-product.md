# Plan: Producto de catálogo tipo llavero (+ unificación posterior con ADHOC)

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza para que el proceso
> sea retomable. Cada fase tiene su bloque **Tests / verificación** — no pasar a
> la fase siguiente hasta que la anterior verifique en verde.

> **Estado (2026-07-22): Parte A y Parte B implementadas.** La unificación con
> el cotizador ADHOC está hecha: el cotizador de llaveros usa la grilla contigua
> `KeychainScaleTier`, acepta cualquier cantidad (p.ej. 7 → escala 5-24, base de
> tanda ÷ 5), tiene dos secciones de piezas (individual + tanda) e insumos/
> adicionales por unidad. La grilla vieja `KeychainTier` fue retirada (tabla
> dropeada, módulo/servicio/spec/form/card eliminados). Smoke test end-to-end
> verde contra la DB real. `KeychainDefaults` se conserva. Decisión de producto:
> en el cotizador la sección individual es **opcional** (fallback tanda ÷ N para
> 1-4); el catálogo sí la exige.
>
> **Estado (2026-07-21): Parte A implementada.** Todo el código de las fases
> A1–A7 está escrito. Verificado automáticamente: `pnpm -r typecheck` en verde
> (api + web + shared) y `pnpm api test` con 94/94 tests (incluye los nuevos
> `select-pieces` y `keychain-scale-tiers`). **Pendiente de correr por el
> usuario contra una DB/app real**: aplicar la migración (`prisma migrate
> deploy`) + `prisma:seed`, y el checklist de QA manual de A8 (cálculo
> end-to-end en el navegador). El repo no tiene ESLint v9 configurado, así que
> `lint` falla igual que antes de este trabajo — no es una regresión. La Parte B
> queda sin empezar por diseño (post-estabilización de A).

## Decisiones cerradas (2026-07-21)

1. **Es un nuevo _tipo de producto de catálogo_ persistido**, no un ADHOC. Tiene
   SKU, categoría, es editable y reutilizable como cualquier producto.
2. **Escalas nuevas contiguas**: `1-4`, `5-24`, `25-49`, `50-99`, `100+`. Son
   contiguas (sin huecos) porque un producto de catálogo se puede pedir en
   **cualquier** cantidad. Esto las distingue de la grilla ADHOC actual
   (`KeychainTier`), que tiene huecos porque exige múltiplos de 5.
3. **Markups desde una grilla global nueva** (`KeychainScaleTier`), editable
   desde `/parametros`. Un solo lugar para tocar; todos los productos tipo
   llavero la comparten.
4. **Tamaño de tanda = 5, global**: se reutiliza el global param existente
   `keychain_batch_size` (default `5`) como divisor. Nada por producto.
5. **El flujo ADHOC actual (`/cotizaciones/nueva-llaveros`) queda INTACTO** en la
   Parte A. La convergencia (que el cotizador ADHOC adopte este mismo cálculo y
   grilla) es la **Parte B**, posterior.

## Modelo conceptual

Un producto tipo llavero se diferencia de un producto estándar en dos cosas y
solo dos:

1. **Guarda dos juegos de piezas impresas**:
   - **Individual** — todas las piezas para imprimir **1 producto** solo.
   - **Tanda** — todas las piezas del **mismo producto** dispuestas en una placa
     de `N = 5` productos. No es 5× la individual: el arreglo en placa cambia
     gramos y minutos reales (skirt compartido, packing, etc.). Por eso se
     cargan aparte.
2. **Se cotiza con 5 escalas fijas** donde la escala `1-4` usa la base individual
   y las escalas `5+` usan la base de tanda dividida por `N`.

Los **insumos** y **adicionales** (armado, gestión) son **siempre por unidad**:
una sola carga, idéntica en todas las escalas. NO se dividen por tanda (a
diferencia del ADHOC actual — ver Parte B). Los productos de catálogo **no**
tienen `designMinutes`.

## Modelo matemático

Sea `N = keychain_batch_size` (=5).

Dos bases de costo por unidad, calculadas con el **mismo motor de costeo**
([costing.calculator.ts:40](../../apps/api/src/modules/costing/costing.calculator.ts#L40)):

```
costIndiv     = costing.forProduct(p, { pieceScope: INDIVIDUAL })
                  → piezas individuales tal cual
costBatchUnit = costing.forProduct(p, { pieceScope: BATCH, divideBy: N })
                  → piezas de tanda con grams/printMinutes ÷ N
```

En ambas, insumos + armado + gestión + marketing entran **iguales, por unidad**
(no se filtran ni dividen). Solo cambia la porción de piezas impresas
(filamento + minutos de máquina).

Precio por escala `e` (markup `m_e`), canal `c`:

```
base_e     = (e == "1-4") ? costIndiv : costBatchUnit
unitPrice_e = engine.price(base_e, c, productInputs, globals,
                           { markupPct: m_e }, customerProfile)
lineTotal   = unitPrice_e × qty
```

`engine.price` ya suma insumos post-profit y aplica comisión/impuestos, igual
que para productos estándar. No se toca el motor.

**Verificación de comportamiento** (markups de ejemplo 100/80/60/50/35):

| qty | escala | base       | markup |
|-----|--------|------------|--------|
| 1   | 1-4    | individual | 100    |
| 3   | 1-4    | individual | 100    |
| 5   | 5-24   | tanda ÷ 5  | 80     |
| 10  | 5-24   | tanda ÷ 5  | 80     |
| 30  | 25-49  | tanda ÷ 5  | 60     |
| 88  | 50-99  | tanda ÷ 5  | 50     |
| 150 | 100+   | tanda ÷ 5  | 35     |

- Dentro de una misma escala el `lineTotal` es lineal en `qty` (qty=10 = 2×
  qty=5) porque base y markup no cambian.
- Al cruzar de escala cambian el markup **y** (solo en el salto 4→5) la base.

## Naming y ubicación de código

- Enum `ProductKind { STANDARD, KEYCHAIN }` — nuevo, en `schema.prisma`.
- Enum `PieceScope { INDIVIDUAL, BATCH }` — nuevo, en `schema.prisma`.
- Modelo `KeychainScaleTier` — grilla global de 5 escalas contiguas. Nombre
  neutro a propósito: en la Parte B lo comparte también el cotizador ADHOC.
- Módulo backend `apps/api/src/modules/keychain-scale-tiers/` — espeja la
  estructura de `keychain-tiers/`.
- Página frontend `/productos/nuevo-llavero`; `ProductEditor` con prop
  `variant: 'standard' | 'keychain'`.

---

# Parte A — Producto de catálogo tipo llavero

## Fase A1 — Modelo de datos (Prisma + migración + seed)

- [ ] `schema.prisma`: agregar enum `ProductKind { STANDARD KEYCHAIN }`.
- [ ] `schema.prisma`: agregar enum `PieceScope { INDIVIDUAL BATCH }`.
- [ ] `Product`: campo `kind ProductKind @default(STANDARD)`.
- [ ] `ProductPiece`: campo `scope PieceScope @default(INDIVIDUAL)`.
- [ ] `schema.prisma`: modelo nuevo `KeychainScaleTier`
      (`id`, `minQty Int @unique`, `maxQty Int?`, `markupPct Decimal @db.Decimal(6,2)`,
      `sortOrder Int`, `notes String?`, timestamps).
- [ ] Migración `prisma migrate dev --name keychain_catalog_product`. Aditiva:
      defaults dejan a todo lo existente como `STANDARD` / `INDIVIDUAL`.
- [ ] `seed.ts` `seedKeychainScaleTiers()`: 5 filas idempotentes (upsert por
      `minQty`) — `1-4=100`, `5-24=80`, `25-49=60`, `50-99=50`, `100+ (maxQty null)=35`.
      Estructura inmutable (5 filas), solo `markupPct` editable después.

### Tests / verificación A1
- [ ] `pnpm api prisma:generate` sin errores; `pnpm -r typecheck` en verde.
- [ ] Migración aplica limpia sobre una DB con datos: `pnpm api prisma:migrate:deploy`.
- [ ] **Query de regresión**: `SELECT count(*) FROM products WHERE kind <> 'STANDARD'`
      = 0 (ningún producto viejo cambió de tipo).
- [ ] **Query de regresión**: `SELECT count(*) FROM product_pieces WHERE scope <> 'INDIVIDUAL'`
      = 0 (ninguna pieza vieja cambió de scope).
- [ ] `pnpm api prisma:seed` idempotente: correr dos veces deja exactamente 5
      filas en `keychain_scale_tiers` con la cadena contigua y sin huecos.

## Fase A2 — Costing por scope (lógica pura)

- [ ] Helper puro `selectPieces(pieces, { scope, divideBy })`: filtra por scope
      y divide `grams`/`printMinutes` por `divideBy` (default 1). No toca
      cantidad de piezas ni materiales. Espeja `divideForBatch`
      ([keychain-tiers.service.ts:123](../../apps/api/src/modules/keychain-tiers/keychain-tiers.service.ts#L123)).
- [ ] `costing.service.ts` `forProduct(productId, opts?)`: `opts?.pieceScope`
      y `opts?.divideBy` filtran/dividen las piezas antes de `calculator.compute()`.
      Sin `opts` → comportamiento actual (todas las piezas, sin dividir).
      Materiales, armado, gestión y marketing **nunca** se filtran ni dividen.

### Tests / verificación A2
Archivo: `apps/api/src/modules/costing/costing.calculator.spec.ts` (o un spec
nuevo `select-pieces.spec.ts` para el helper puro).
- [ ] `selectPieces` con `scope=INDIVIDUAL` descarta las piezas BATCH y no toca gramos/minutos.
- [ ] `selectPieces` con `scope=BATCH, divideBy=5` deja solo piezas BATCH con
      `grams` y `printMinutes` divididos por 5, y `quantity` de materiales **sin** tocar.
- [ ] `divideBy=1` (o ausente) no altera valores.
- [ ] **Equivalencia**: un producto con piezas BATCH de `grams=25, printMinutes=100`
      divididas por 5 produce el mismo costo de fabricación que un producto con
      piezas individuales de `grams=5, printMinutes=20`.
- [ ] Comando: `pnpm api test costing`.

## Fase A3 — Grilla global de escalas (backend + parámetros)

- [ ] Módulo `keychain-scale-tiers/`: `service` + `controller`, espejando
      `keychain-tiers/`.
- [ ] `list()`: devuelve las 5 filas ordenadas por `sortOrder`.
- [ ] `findApplicable(qty)`: fila donde `qty >= minQty && (maxQty == null || qty <= maxQty)`.
- [ ] `pickScope(qty)`: `INDIVIDUAL` si `qty < N` (primera fila), `BATCH` si no.
      (N = límite superior de la primera escala + 1 = 5; se deriva de la grilla,
      no se hardcodea.)
- [ ] `updateMarkup(id, pct)`: único mutador; sin create/delete (grilla inmutable).
- [ ] `assertValidGrid()` (invariantes, al leer/seedear): primera fila `minQty=1`;
      cadena contigua sin huecos (`t.minQty === prev.maxQty + 1`); solo la última
      con `maxQty=null`; markups estrictamente decrecientes al subir la cantidad.
      Espeja `validateTierSet`
      ([category-tiers.service.ts:258](../../apps/api/src/modules/categories/category-tiers.service.ts#L258)).
- [ ] Endpoints `GET /keychain-scale-tiers` y `PATCH /keychain-scale-tiers/:id`.
- [ ] Registrar el módulo en `app.module.ts`.

### Tests / verificación A3
Archivo: `apps/api/src/modules/keychain-scale-tiers/keychain-scale-tiers.service.spec.ts`
(espeja [keychain-tiers.service.spec.ts](../../apps/api/src/modules/keychain-tiers/keychain-tiers.service.spec.ts)).
- [ ] `findApplicable`: `1→1-4`, `4→1-4`, `5→5-24`, `24→5-24`, `25→25-49`,
      `49→25-49`, `50→50-99`, `99→50-99`, `100→100+`, `9999→100+`.
- [ ] `findApplicable` cubre **todo** entero `≥1` sin huecos (loop 1..200, siempre resuelve una fila).
- [ ] `pickScope`: `1..4 → INDIVIDUAL`, `5, 33, 200 → BATCH`.
- [ ] `assertValidGrid` rechaza: primera fila con `minQty≠1`; hueco entre filas;
      dos filas abiertas; markup creciente.
- [ ] Comando: `pnpm api test keychain-scale-tiers`.

## Fase A4 — Productos CRUD (kind + scope)

- [ ] `products.controller.ts` `inputSchema`
      ([products.controller.ts:41](../../apps/api/src/modules/products/products.controller.ts#L41)):
      aceptar `kind: z.enum(['STANDARD','KEYCHAIN']).default('STANDARD')` y
      `scope` opcional en cada pieza.
- [ ] Refine de validación: si `kind === 'KEYCHAIN'` exigir **≥1 pieza
      `INDIVIDUAL` y ≥1 pieza `BATCH`**. Si `kind === 'STANDARD'` todas las
      piezas deben ser `INDIVIDUAL` (o ausente).
- [ ] `products.service.ts` `create`/`update`
      ([products.service.ts:166](../../apps/api/src/modules/products/products.service.ts#L166)):
      persistir `kind` y el `scope` de cada pieza. SKU sigue autogenerado e inmutable.
- [ ] El getter de detalle de producto incluye `kind` y el `scope` por pieza en el DTO.

### Tests / verificación A4
- [ ] `pnpm -r typecheck` en verde tras el cambio de tipos del DTO/payload.
- [ ] **QA manual (API)**: `POST /products` con `kind=KEYCHAIN` y solo piezas
      INDIVIDUAL → 400 (falta la sección tanda). Con ambas secciones → 201.
- [ ] **QA manual (API)**: `POST /products` con `kind=STANDARD` y una pieza
      `scope=BATCH` → 400.
- [ ] **QA manual (API)**: `GET /products/:id` de un llavero devuelve `kind` y
      `scope` por pieza.

## Fase A5 — Integración pricing / quotes

- [ ] `pricing.service.ts` `forProduct`
      ([pricing.service.ts:69](../../apps/api/src/modules/pricing/pricing.service.ts#L69)):
      rama `if (product.kind === 'KEYCHAIN')` que arma la grilla desde las 5
      `KeychainScaleTier` en vez de `CategoryPriceTier`. Escala `1-4` usa
      `costIndiv`; el resto `costBatchUnit`. Cada línea con
      `engine.price(..., { markupPct: tier.markupPct })`.
- [ ] `quotes.service.ts` `computeUnitPrice` / `buildItemRow`
      ([quotes.service.ts:679](../../apps/api/src/modules/quotes/quotes.service.ts#L679)):
      rama para `product.kind === 'KEYCHAIN'` — resolver tier con
      `keychainScaleTiers.findApplicable(qty)`, elegir base con `pickScope(qty)`,
      pasar `markupOverridePct = tier.markupPct`. **Sin** división de insumos/labor
      (ya son por unidad) y **sin** `designSurcharge`.
- [ ] Snapshot en el `QuoteItem`: guardar `appliedMarkupPct` y `tierLabel` para
      auditoría/PDF (análogo al ADHOC keychain), y `pricingBase: 'INDIVIDUAL' | 'BATCH'`.
- [ ] Precedencia de markup sin cambios: `customer.customMarkupPct` sigue
      pisando al tier si el cliente tiene override.

### Tests / verificación A5
Archivo: `apps/api/src/modules/pricing/pricing.engine.spec.ts` (unidad del motor)
+ QA manual para el end-to-end (el repo no tiene harness de integración Prisma;
ver nota al pie).
- [ ] Unidad del motor: dado un `costIndiv` y `costBatchUnit` fijos, `engine.price`
      con cada `markupPct` produce los 5 precios esperados (comisión/impuestos
      constantes).
- [ ] **QA manual**: cotizar el mismo producto llavero con `qty=3` y `qty=5` →
      `qty=3` usa base individual + markup 1-4; `qty=5` usa base tanda ÷5 +
      markup 5-24 (precios distintos, escala visible en el detalle).
- [ ] **QA manual (linealidad)**: `qty=5` vs `qty=10` → `lineTotal` exactamente
      ×2 (misma escala 5-24).
- [ ] **QA manual (salto de escala)**: `qty=24` vs `qty=25` → cambia el markup
      (5-24 → 25-49), misma base tanda.
- [ ] **QA manual (cliente con override)**: cliente con `customMarkupPct` pisa
      el markup del tier.

## Fase A6 — Frontend: alta y formulario

- [ ] `products-list.tsx`
      ([products-list.tsx:92](../../apps/web/src/app/(protected)/productos/products-list.tsx#L92)):
      segundo botón "Nuevo producto tipo llavero" → `/productos/nuevo-llavero`
      (gate `canWrite`).
- [ ] Página `productos/nuevo-llavero/page.tsx`: clon de
      [nuevo/page.tsx](../../apps/web/src/app/(protected)/productos/nuevo/page.tsx)
      que renderiza `<ProductEditor mode="create" variant="keychain" />`.
- [ ] `ProductEditor` (`productos/[id]/product-editor.tsx`): prop
      `variant?: 'standard' | 'keychain'` (default `standard`). Estado suma
      `batchPieces: PieceState[]` cuando es keychain.
- [ ] Cuando `variant === 'keychain'` renderizar **dos** cards de piezas:
      "Piezas — producto individual" (mapea a `scope=INDIVIDUAL`) y
      "Piezas — tanda (placa de {N})" (mapea a `scope=BATCH`). El resto igual.
- [ ] Cards "Insumos extra" y adicionales (armado/gestión) con nota
      "por unidad" cuando es keychain.
- [ ] `buildPayload`: incluir `kind` y mapear ambos arrays con su `scope`.
- [ ] `isFormValid` (keychain): exigir ≥1 pieza individual **y** ≥1 pieza de tanda.
- [ ] La página de **edición** (`productos/[id]`) detecta `product.kind` y
      renderiza en modo keychain (dos secciones) para editar llaveros existentes.

### Tests / verificación A6
- [ ] `pnpm web typecheck` y `pnpm web lint` en verde.
- [ ] **QA manual**: el botón nuevo aparece solo con permiso `product:write`.
- [ ] **QA manual**: alta de un llavero con ambas secciones → guarda y redirige
      al detalle; reabrir en edición muestra las dos secciones pobladas.
- [ ] **QA manual**: intentar guardar sin la sección tanda → el form bloquea
      (validación cliente) y el backend rechaza (defensa en profundidad).
- [ ] **QA manual (no-regresión)**: el alta de producto **estándar**
      (`/productos/nuevo`) sigue con una sola sección de piezas y funciona igual.

## Fase A7 — Frontend: panel de precios + parámetros UI

- [ ] Panel de costo lateral del editor: cuando `variant === 'keychain'`, mostrar
      la **grilla de 5 escalas** (base, markup, precio unitario por escala),
      leyendo de `pricing.service.forProduct`. Indicar cuál usa base individual
      vs tanda.
- [ ] Pantalla de parámetros para editar los 5 markups de `KeychainScaleTier`
      (análoga a `parametros/llaveros/keychain-tiers-form.tsx`). Solo edita
      `markupPct`; estructura fija.
- [ ] Link/acceso desde `/parametros` a la nueva grilla.

### Tests / verificación A7
- [ ] `pnpm web typecheck` / `pnpm web lint` en verde.
- [ ] **QA manual**: cambiar un markup en parámetros se refleja en la grilla del
      panel de precios del producto.
- [ ] **QA manual**: la grilla del panel muestra 5 filas con los rangos
      `1-4 / 5-24 / 25-49 / 50-99 / 100+` y marca la base (individual vs tanda).

## Fase A8 — QA manual end-to-end (checklist de aceptación)

- [ ] Crear categoría cualquiera y un producto tipo llavero con: 2 piezas
      individuales, 3 piezas de tanda, 1 insumo, armado y gestión.
- [ ] Verificar en el panel: precio `1-4` calculado sobre la base individual;
      precios `5-24…100+` sobre la base tanda ÷ 5. Sumar a mano insumo + labor
      y confirmar que cuadra.
- [ ] Cotizar el producto con `qty=1, 4, 5, 25, 100` y confirmar que el
      `unitPrice` de cada cotización coincide con la fila correspondiente del panel.
- [ ] Confirmar linealidad dentro de escala (`qty=5` vs `qty=10`).
- [ ] Confirmar que el flujo ADHOC de llaveros (`/cotizaciones/nueva-llaveros`)
      **no cambió** en nada.
- [ ] Confirmar que un producto estándar se cotiza igual que antes (no-regresión).
- [ ] Generar PDF de una cotización con el producto llavero → ítem correcto,
      sin badge de batch (eso es del ADHOC).

> **Nota sobre tests automatizados**: como en `keychain-batch-of-5.md`, el repo
> tiene specs unitarios (Jest) para lógica pura (calculadora, tiers) pero **no**
> hay harness de integración contra Prisma + costing en CI. Por eso el cálculo
> end-to-end (A5, A7, A8) se valida con QA manual; lo unitario y atómico
> (`selectPieces`, `findApplicable`, `pickScope`, `assertValidGrid`, motor) sí
> lleva tests automatizados.

---

# Parte B — Unificación con el modelo ADHOC (posterior)

> Objetivo: que el cotizador de llaveros ADHOC (`/cotizaciones/nueva-llaveros`)
> use **la misma grilla (`KeychainScaleTier`) y el mismo cálculo** que el
> producto de catálogo, y retirar la grilla vieja `KeychainTier`. Arrancar solo
> cuando la Parte A esté verificada y estable en producción.

## Diferencias a reconciliar (estado actual ADHOC → objetivo)

1. **Grilla**: ADHOC usa `KeychainTier` (huecos, `5-20/25-35/40-95`).
   Objetivo: `KeychainScaleTier` (contiguo, `5-24/25-49/50-99`).
2. **Cantidades**: ADHOC exige múltiplos de 5 (`assertValidQty`
   [keychain-tiers.service.ts:91](../../apps/api/src/modules/keychain-tiers/keychain-tiers.service.ts#L91)).
   Objetivo: como las escalas ahora son contiguas, se puede **relajar** a
   cualquier entero ≥1 (decisión a confirmar en su momento).
3. **Semántica de insumos/labor**: ADHOC hoy **divide** `assemblyMinutes` y
   `managementMinutes` por el batch (decisión de `keychain-batch-of-5.md`).
   El modelo nuevo los trata **por unidad** (no divide). Unificar implica
   **cambiar la semántica del ADHOC** a "por unidad" — es el cambio de mayor
   impacto y hay que comunicarlo.
4. **Dos bases (individual vs tanda)**: hoy el ADHOC carga un solo juego de
   piezas (interpretado como tanda). Objetivo: ofrecer las dos secciones como en
   el catálogo, para que la escala `1-4` tenga base individual real.
5. **`designMinutes`**: existe solo en el ADHOC (cargo plano). Se conserva como
   surcharge; no entra a las bases.

## Fase B1 — Backend: cotizador ADHOC apunta a `KeychainScaleTier`

- [ ] `quotes.service.ts` rama `templateKind === 'KEYCHAIN'`
      ([quotes.service.ts:527](../../apps/api/src/modules/quotes/quotes.service.ts#L527)):
      resolver el tier con `keychainScaleTiers.findApplicable` (grilla nueva) en
      vez de `keychainTiers.findApplicable`.
- [ ] `keychainMatrix()`
      ([quotes.service.ts:402](../../apps/api/src/modules/quotes/quotes.service.ts#L402)):
      iterar las 5 filas de `KeychainScaleTier`.
- [ ] Reemplazar la semántica de batch: piezas de tanda ÷ N; insumos, armado y
      gestión **por unidad** (dejan de dividirse). Actualizar
      `keychain-batch-of-5.md` (decisión #1) marcando el cambio de criterio.
- [ ] Relajar `assertValidQty` a cualquier entero ≥1 (o mantener múltiplos de 5
      si el negocio lo prefiere — **decisión a confirmar**).
- [ ] Añadir la sección de piezas "individual" al payload ADHOC para que `1-4`
      tenga base propia (opcional; si no se carga, `1-4` cae a tanda ÷ N con nota).

### Tests / verificación B1
- [ ] Specs de `quotes` existentes de keychain siguen pasando tras repuntar la grilla.
- [ ] Nuevo spec: `findApplicable` del ADHOC devuelve la fila contigua correcta
      para `qty` no múltiplo de 5 (p.ej. `qty=7 → 5-24`).
- [ ] **QA manual**: una cotización ADHOC nueva y un producto de catálogo
      equivalente (mismas piezas/insumos, misma qty) dan el **mismo** `unitPrice`.
- [ ] **QA manual (inmutabilidad)**: cotizaciones ADHOC viejas conservan su
      `lineTotal` snapshoteado (no se recalculan).

## Fase B2 — Frontend ADHOC alineado

- [ ] `rapid-quote-form.tsx` (modo keychain): agregar la sección "piezas
      individuales" y ajustar labels de insumos/labor a "por unidad".
- [ ] Actualizar el mensaje explicativo del header de `nueva-llaveros/page.tsx`
      (ya no "todo por batch"; ahora piezas de tanda por placa, resto por unidad).
- [ ] Matriz de precios lee la grilla nueva.

### Tests / verificación B2
- [ ] `pnpm web typecheck` / `pnpm web lint` en verde.
- [ ] **QA manual**: la matriz del cotizador ADHOC coincide con la grilla del
      panel del producto de catálogo para los mismos inputs.

## Fase B3 — Retiro de `KeychainTier`

- [ ] Confirmar que ningún flujo referencia ya `KeychainTier` /
      `keychain-tiers.service`.
- [ ] Migración que elimina `KeychainTier` y su seed (o lo deja deprecado con
      nota, según preferencia de reversibilidad).
- [ ] Consolidar la UI de parámetros: una sola grilla de escalas de llavero.
- [ ] Actualizar docs (`keychain-batch-of-5.md`, este plan) marcando la
      unificación como completada.

### Tests / verificación B3
- [ ] `pnpm -r typecheck` y `pnpm -r test` en verde tras el retiro.
- [ ] Búsqueda global sin referencias colgadas a `KeychainTier` /
      `keychain-tiers` (salvo en changelog/docs).

---

## Edge cases

1. **Producto llavero sin sección tanda**: bloqueado por validación (A4). No hay
   fallback silencioso.
2. **Divisiones no enteras**: `23g / 5 = 4.6g` es legítimo; el costing usa
   Decimal, no rompe.
3. **qty muy grande (100+)**: `qty/5` da un multiplicador grande; la linealidad
   se mantiene dentro de la escala `100+`.
4. **Cambio de `keychain_batch_size`**: afecta a productos llavero nuevos y a la
   grilla del panel al recalcular. Como el precio de catálogo se calcula on-read
   (no snapshoteado en el producto), el panel refleja el `N` actual. Las
   **cotizaciones** ya emitidas conservan su `lineTotal` snapshoteado.
5. **Cliente con `customMarkupPct`/`minTierQty`**: sigue teniendo precedencia
   sobre el tier de escala (sin cambios en el motor).
6. **Categoría del producto llavero**: se exige igual (organizativa), pero el
   markup lo pisa la grilla de escalas — la categoría no aporta markup para
   estos productos.

## Riesgos

1. **Confusión individual vs tanda** al cargar el form. Mitigación: labels
   claros, nota "placa de {N}" y "por unidad", y el panel de precios mostrando
   la base de cada escala en vivo.
2. **Doble fuente de verdad temporal** (`KeychainTier` viejo + `KeychainScaleTier`
   nuevo) hasta la Parte B. Mitigación: nombres distintos, y la Parte B retira la
   vieja. Documentado como transición esperada.
3. **Cambio de semántica del ADHOC en B1** (insumos/labor dejan de dividirse):
   puede alterar precios de cotizaciones ADHOC nuevas respecto de hoy.
   Mitigación: comunicar al equipo, verificar equivalencia catálogo↔ADHOC en QA,
   y que las cotizaciones históricas queden intactas por snapshot.
4. **Precio on-read para productos** vs snapshot en cotización: el panel puede
   mostrar un precio distinto al de una cotización vieja si cambió un markup.
   Es el comportamiento esperado (igual que productos estándar hoy).
