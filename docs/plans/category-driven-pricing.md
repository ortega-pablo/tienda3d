# Plan: Escalas por categoría + cotizaciones simplificadas

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza para que el proceso
> sea retomable.

## Contexto

Hoy las escalas (`ProductPriceTier`) viven en cada producto: el admin
configura `minQty / maxQty / markupPct` por canal en cada item del catálogo.
Esto generó dos problemas operativos:

1. **Duplicación**: 10 productos de la misma categoría requieren 10 cargas de
   escala manualmente coordinadas. Si el admin decide subir el markup a la
   tier 25-49 de "lámparas", debe tocar cada producto.
2. **Decisión incoherente**: dos productos en la misma categoría podían
   terminar con markups distintos por descuido, y el negocio quería tratarlos
   parejo.

La nueva regla del negocio: **las escalas son característica de la categoría
o sub-categoría**, no del producto. El producto carga su BOM (piezas,
insumos, tiempos) y deriva el markup desde su categoría. Esto implica que la
categoría pasa a ser **obligatoria** al crear/editar un producto.

En paralelo, la creación de cotizaciones del catálogo se simplifica para que
quien cotiza no tenga que elegir canal: siempre se cotiza por **Venta
Directa**, y un checkbox "Operación sin factura" alterna al canal **Efectivo**
(las dos únicas formas de pago que el taller maneja end-to-end). MercadoLibre
queda fuera del flujo de cotización (sigue presente como canal para mostrar
precios en el panel de productos, pero no se ofrece como opción al cotizar).

La cotización de **llaveros** ya tiene su propia escala fija. Falta agregar
una vista de tabla comparativa de precios para que el cliente vea de un vistazo
qué le sale cada tier.

## Decisiones acordadas

1. **Escalas → categoría/subcategoría, por canal**. Nueva tabla
   `CategoryPriceTier { categoryId, channelId, minQty, maxQty, markupPct }`.
2. **Subcategoría hereda del padre** cuando no tiene escalas propias. Si la
   subcategoría carga sus tiers, pisan completamente las del padre (no se
   mergea por tier — es todo o nada para mantener la lógica predecible).
3. **Migración con limpieza total**: la tabla `product_price_tiers` se
   elimina. Las escalas se cargan de cero a nivel categoría. Productos sin
   tiers de categoría quedan sin escala hasta que el admin las configure
   (el producto sigue siendo cotizable sin tier — el motor usa el "markup
   base" de la categoría, ver punto 5).
4. **`Product.targetMarkupPct` se elimina**. El markup viene 100% de la
   categoría. Una sola fuente de verdad.
5. **Markup base de categoría**. Cada categoría/subcategoría tiene un
   `baseMarkupPct` (el que aplica cuando no hay tier que cubra la cantidad,
   típicamente qty=1). Esto reemplaza al `targetMarkupPct` del producto.
6. **Categoría/subcategoría obligatoria en producto**. `Product.categoryId`
   pasa a `NOT NULL`. Migración asigna una categoría "Sin clasificar" a los
   productos huérfanos (semilla nueva) para no perder el catálogo histórico.
   El admin reclasifica luego.
7. **Canal en cotización de catálogo se elimina**. El form de
   `/cotizaciones/nueva-catalogo` siempre cotiza contra **Venta Directa**.
   No hay selector de canal.
8. **Checkbox semántico flipped**: pasa de "Operación con factura" a
   **"Operación sin factura"**. Default unchecked = con factura = Venta
   Directa. Checked = sin factura = canal **Efectivo**. La diferencia es
   estructural: Efectivo no tiene IVA, ni régimen unificado (la regla
   actual de CASH en el motor cubre esto). Cambia los precios en vivo.
9. **MELI queda fuera del flujo de cotización**. Sigue siendo un canal
   visible en `/productos/:id` (matriz de precios del staff) pero no se
   ofrece como opción al cotizar. Las cotizaciones a medida y la de
   llaveros también se restringen a Venta Directa / Efectivo.
10. **Cotización a medida y de llaveros**: el mismo checkbox "sin factura"
    aplica. Misma lógica que catálogo.
11. **Tabla comparativa de llaveros**: en `/cotizaciones/nueva-llaveros`,
    debajo del form aparece una tabla con todas las tiers de la grilla
    (1-4, 5-20, 25-35, 40-95, 100+) y el precio unitario + total para cada
    tier, calculado con los materiales y minutos cargados. La fila de la
    tier activa queda destacada. Permite al vendedor ver el incentivo de
    saltar de tier sin tener que ir cambiando la cantidad.
12. **`Customer.defaultChannelId` se elimina** (decisión 2026-05-16). Con
    el flujo simplificado el campo pierde sentido: el canal lo elige el
    checkbox "sin factura", no la configuración del cliente. La columna se
    dropea en la misma migración. Cuando se ejecute el portal de cliente
    (`customer-portal.md`), las pantallas de precios usan el mismo
    mecanismo.

## Modelo de datos final

```prisma
model Category {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  parentId        String?
  parent          Category?  @relation("CategoryParent", fields: [parentId], references: [id])
  children        Category[] @relation("CategoryParent")
  // NUEVO: markup que aplica cuando no hay tier que cubra la cantidad.
  baseMarkupPct   Decimal  @db.Decimal(6, 2)
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
  // NUEVO: relación con escalas (puede estar vacía).
  priceTiers      CategoryPriceTier[]
  // ...resto sin cambios
}

/// Escala de markup por categoría y canal. Reemplaza a ProductPriceTier.
/// Subcategorías que no tienen sus propios tiers caen al padre.
model CategoryPriceTier {
  id          String   @id @default(cuid())
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  channelId   String
  channel     Channel  @relation(fields: [channelId], references: [id], onDelete: Cascade)
  minQty      Int
  maxQty      Int?     // null = tier abierto
  markupPct   Decimal  @db.Decimal(6, 2)

  @@unique([categoryId, channelId, minQty])
  @@index([categoryId, channelId])
  @@map("category_price_tiers")
}

model Product {
  // ELIMINADO: targetMarkupPct
  categoryId  String   // ANTES: String?
  category    Category @relation(...)
  // ELIMINADA la relación priceTiers (tabla product_price_tiers se borra).
  // ...resto sin cambios
}
```

## Resolución de markup (nueva precedencia)

Mismo orden de prioridad que hoy, pero las fuentes cambian:

```
customer.customMarkupPct
  > tier.markupPct (resuelto de category.priceTiers según qty + channel)
  > category.priceTiers fallback (parent.priceTiers si subcategory no tiene)
  > category.baseMarkupPct (markup default cuando no hay tier que cubra la qty)
```

El motor (`PricingEngine.price()`) ya espera un `tier.markupPct` desde el
caller. El cambio es solo *quién* lo resuelve: en lugar del `ProductTiersService`,
un nuevo `CategoryTiersService` que sube la cadena padre→subcategoría según
corresponda.

## Fases

### Fase 1 — Schema y migración (backend)

- [ ] Agregar `baseMarkupPct` a `Category` (`@db.Decimal(6, 2)`).
- [ ] Crear modelo `CategoryPriceTier` con `@@unique([categoryId, channelId, minQty])`.
- [ ] Migración SQL:
  - [ ] `ALTER TABLE categories ADD COLUMN "baseMarkupPct" DECIMAL(6,2)`. Backfill con 100 (placeholder, admin ajusta después).
  - [ ] `CREATE TABLE category_price_tiers`.
  - [ ] Crear categoría seed `'sin-clasificar'` con `baseMarkupPct = 100` y `isActive = true`.
  - [ ] `UPDATE products SET "categoryId" = (id de 'sin-clasificar') WHERE "categoryId" IS NULL`.
  - [ ] `ALTER TABLE products ALTER COLUMN "categoryId" SET NOT NULL`.
  - [ ] `ALTER TABLE products DROP COLUMN "targetMarkupPct"`.
  - [ ] `DROP TABLE product_price_tiers CASCADE`.
  - [ ] `ALTER TABLE customers DROP COLUMN "defaultChannelId"` (decisión 12). Esto deja huérfanas las referencias en código (`customer.defaultChannelId`) que se limpian en Fase 5/6.
- [ ] Actualizar `seed.ts`: categoría "sin-clasificar" idempotente.
- [ ] Regenerar Prisma client.

### Fase 2 — Backend services y endpoints

- [ ] Nuevo `CategoryTiersService`:
  - [ ] `list(categoryId, channelId?)`: devuelve tiers efectivos (propios o heredados del padre, fallback explícito).
  - [ ] `findApplicable(categoryId, channelId, qty)`: resuelve la tier que cubre `qty`, o `null` si cae al `baseMarkupPct`.
  - [ ] `replaceForCategory(categoryId, channelId, tiers[], actorId)`: reemplaza atómicamente el set de tiers de una categoría/canal. Audit log incluido.
  - [ ] `resolveMarkup(categoryId, channelId, qty)`: devuelve `{ markupPct, source: 'tier' | 'base' | 'parent-tier' | 'parent-base' }`.
- [ ] Nuevo endpoint REST:
  - [ ] `GET /categories/:id/tiers?channelId=...` → tiers del canal (con flag `inheritedFromParent`).
  - [ ] `PUT /categories/:id/tiers` body `{ channelId, tiers: [...] }` → reemplazo atómico, permiso `parameter:write` o `category:write` (decidir).
  - [ ] `PATCH /categories/:id` ahora acepta `baseMarkupPct`.
- [ ] **Eliminar** `ProductTiersService` y todos sus consumidores:
  - [ ] Quitar `productPriceTier` del schema y todas las referencias en `quotes.service.ts`, `customer-pricing.service.ts`, `pricing.service.ts`, `product-tiers.service.ts`, `products.service.ts`.
  - [ ] Sus llamadas pasan a usar `CategoryTiersService.findApplicable(...)` con el `categoryId` del producto.
- [ ] Actualizar `products.controller.ts` Zod schema:
  - [ ] `categoryId` pasa a `z.string().min(1)` (obligatorio).
  - [ ] Quitar `targetMarkupPct` del input.
  - [ ] Quitar `pieces.length > 0 || materials.length > 0` está OK; agregar refine: la categoría existe.
- [ ] `pricing.service.ts`:
  - [ ] `forProduct(productId)`: usar `CategoryTiersService` con el `product.categoryId`.
  - [ ] La matriz de precios del producto (panel `/productos/:id`) sigue mostrando todas las tiers + canales — solo cambia la fuente.
- [ ] `customer-pricing.service.ts`:
  - [ ] `mergeTiersBelowFloor` recibe ahora tiers de categoría, mismo algoritmo.
- [ ] Tests:
  - [ ] Actualizar fixtures de `pricing.engine.spec.ts` (no debería cambiar la lógica del motor, solo la forma de llamarlo).
  - [ ] Nuevo `category-tiers.service.spec.ts`: cubrir herencia padre → hijo, fallback a `baseMarkupPct`, tier abierto (maxQty null).

### Fase 3 — UI del producto

- [ ] `productos/[id]/product-editor.tsx`:
  - [ ] Quitar campo `targetMarkupPct`.
  - [ ] El select de categoría pasa a `required` con validación inline ("Seleccioná una categoría").
  - [ ] Eliminar toda la sección "Escalas" del editor (ahora vive en admin de categorías).
  - [ ] Mostrar nota arriba: "Las escalas y el markup base de este producto vienen de su categoría. Editarlas en /categorias/:id."
- [ ] La matriz de precios del producto (sigue en la misma página) se alimenta de `category.priceTiers` o las del padre. No cambia visualmente para el staff.

### Fase 4 — Admin de categorías con tiers

- [ ] `/categorias/[id]` ahora muestra un editor con tabs por canal (Venta Directa / Efectivo / MELI):
  - [ ] Cada tab tiene una tabla de tiers (`minQty / maxQty / markupPct`) con add/remove rows.
  - [ ] Toggle "Heredar del padre" para subcategorías. Activo por default si no hay tiers propios. Si se desactiva, aparece la tabla editable.
  - [ ] Campo `baseMarkupPct` editable arriba del tab (es el fallback para cantidades fuera de tier).
- [ ] Validaciones cliente:
  - [ ] `minQty ≥ 1`, `maxQty > minQty` cuando no es `null`.
  - [ ] No overlap entre tiers de la misma categoría/canal (gap permitido — el baseMarkup cubre los huecos).
  - [ ] `markupPct ≥ 0`.
- [ ] Permisos: requiere `category:write` (o crear `category-tier:write` si se quiere granular — pendiente).

### Fase 5 — Cotización de catálogo

- [ ] `cotizaciones/nueva-catalogo/page.tsx`:
  - [ ] Eliminar el select de canal del form.
  - [ ] Reemplazar checkbox "Operación con factura" → "Operación sin factura" (label flipped, lógica invertida).
  - [ ] El estado `channelId` se deriva: `withoutInvoice ? channelEfectivoId : channelVentaDirectaId`. Ambos ids se hidratan en server-side al cargar la página.
  - [ ] Al togglear el checkbox, refrescar el preview (mismo trigger que cambiar cantidad).
  - [ ] Quitar todas las lecturas de `customer.defaultChannelId` (campo eliminado en Fase 1). El form arranca siempre en VD.
- [ ] `quotes.service.ts` `previewItem` / `buildItemRow`:
  - [ ] `channelId` deja de ser nullable en el caller — siempre se manda uno de los dos.
  - [ ] Validar a nivel API que el canal en cotizaciones de catálogo es Venta Directa o Efectivo (lista whitelist).
- [ ] Detalle de cotización `/cotizaciones/:id`: en lugar de mostrar el nombre del canal, mostrar "Con factura" / "Sin factura" como badge.

### Fase 6 — Cotización a medida

- [ ] Mismo cambio que la fase 5 sobre `nueva-a-medida` y `rapid-quote-form.tsx`:
  - [ ] Eliminar select de canal.
  - [ ] Checkbox "Operación sin factura".
  - [ ] Eliminar todas las lecturas/escrituras de `customer.defaultChannelId` en el form (también en `onCustomerChange`).
- [ ] El cargo de diseño (`design_hour_cost`) y demás siguen aplicando igual.

### Fase 7 — Cotización de llaveros con tabla comparativa

- [ ] `nueva-llaveros/page.tsx`: mismas restricciones de canal/checkbox que fase 5/6.
- [ ] Nuevo endpoint `POST /quotes/keychain-matrix`:
  - [ ] Body: `{ payload (sin templateKind ni qty), customerId?, withoutInvoice }`.
  - [ ] Devuelve un array de filas, una por cada tier seedeada:
    ```ts
    [
      { tierId, tierLabel, qty, unitPrice, lineTotal, markupPct },
      ...
    ]
    ```
  - [ ] `qty` representativo de la tier: el `minQty` (ej. 5 para 5-20, 100 para 100+).
  - [ ] Reusa `engine.price()` con el markup de cada tier; agrega también el `designSurcharge` calculado una sola vez (no escala con qty).
- [ ] UI: nuevo card "Precios por escala" debajo del card "Precio actual":
  - [ ] Tabla con columnas `Cantidad | Markup | Unitario | Total`.
  - [ ] Fila de la tier activa con `bg-primary/10`.
  - [ ] Auto-refresh cuando cambian materiales, piezas, minutos, customer o checkbox.
  - [ ] Skeleton mientras carga.

### Fase 8 — Cleanup y verificación

- [ ] Borrar archivos obsoletos:
  - [ ] `apps/api/src/modules/products/product-tiers.service.ts` (lo reemplaza category-tiers).
  - [ ] Cualquier referencia a `productPriceTier` en seeds, fixtures, helpers.
- [ ] Actualizar fixtures de seed: cargar tiers de ejemplo a nivel categoría para que el dev env arranque con valores razonables.
- [ ] Tests E2E (Cypress o equivalente — opcional para este plan, marcar como follow-up).
- [ ] Manual QA:
  - [ ] Crear producto sin categoría → bloqueado.
  - [ ] Cotizar producto con qty que cae en tier de subcategoría → precio correcto.
  - [ ] Cotizar producto con qty fuera de tiers → usa `baseMarkupPct`.
  - [ ] Cotizar producto con subcategoría que hereda → toma del padre.
  - [ ] Toggle "Sin factura" en cotización de catálogo → precio cambia a Efectivo.
  - [ ] Llaveros: tabla comparativa muestra 5 filas, tier activa destacada.
  - [ ] Cliente STANDARD con tier piso → matriz colapsa los tiers como antes (mergeTiersBelowFloor sigue funcionando con tiers de categoría).

## Riesgos y consideraciones

1. **Pérdida de datos de tiers existentes**: la limpieza total elimina la
   tabla `product_price_tiers`. El admin tiene que recargar las escalas a
   nivel categoría. Mitigación: antes de correr la migración, exportar las
   tiers existentes a un CSV de respaldo (script puntual, no necesario en
   prod si no había datos productivos).

2. **Productos huérfanos**: la migración los pone en `sin-clasificar`. Si
   no se reclasifican, todos comparten el mismo markup base. Mitigación:
   warning visible en `/productos` cuando un producto está en
   `sin-clasificar` (badge naranja).

3. **MercadoLibre invisible al cotizar**: si en el futuro se vuelve a usar
   MELI, hay que sumar lógica para habilitar ese canal en el form (puede
   ser un toggle de admin). No bloqueante hoy.

4. **Herencia "todo o nada"**: subcategoría con un solo tier propio
   descarta los del padre. Si el admin quiere mezclar (heredar la mayoría,
   override solo uno) tiene que duplicar todo. Mitigación documental:
   notita en `/categorias/[id]` explicando la regla.

5. **Performance**: cada cotización dispara una resolución de tier por
   item; con categorías heredadas son 2 fetches (subcategoría + padre).
   Mitigación: el `findApplicable` puede cachearse a nivel request si
   crece la carga (no necesario en v1).

## Compatibilidad con planes existentes

- **`customer-types-and-pricing.md`** (Fase 4 ya entregada): el flag
  `customer.minTierQty` por categoría sigue funcionando — ahora apunta a
  tiers de `CategoryPriceTier`. `mergeTiersBelowFloor` no cambia.
  `CustomerCategoryCommitment` sigue siendo `categoryId`-based.
- **`customer-portal.md`** (Fase 7, pendiente): el portal del cliente
  consumirá los precios resueltos por categoría sin cambios estructurales.
  El plan original asumía tiers por producto; al implementarse, hay que
  releer 7.B y ajustar la sección de "precios visibles" para apuntar al
  nuevo modelo.

## Decisiones pendientes (no bloqueantes)

- ¿`baseMarkupPct` por canal o uno solo por categoría? Default propuesto:
  uno solo por categoría (más simple). Si en QA se nota que un canal
  necesita base distinto, se agrega después un `Category.baseMarkupPct`
  por canal.
- ¿Permiso `category-tier:write` separado o reusar `category:write`?
  Default propuesto: reusar `category:write` (granularidad innecesaria al
  arranque).
- Comportamiento si el admin desactiva un canal del sistema (`isActive =
  false`) que tiene tiers cargados: las tiers quedan huérfanas. Default
  propuesto: bloquear el desactivado si hay tiers, con warning explicando
  qué borrar primero.
