# Plan: Modelo de costos Logic C v3 (reabastecimiento por insumo + ganancia de bolsillo)

> Plan vivo para la migración del modelo de costeo. Marcar tareas completadas con
> `[x]` a medida que se avanza, así si el proceso se corta se retoma desde donde
> quedó.

## Contexto

El modelo actual ("Logic B") aplica un único `targetMarkupPct` sobre el costo
total (filamento + insumos extra + máquina + obra + marketing + provisiones).
La ganancia de bolsillo queda diluida porque el markup también cubre costos de
reabastecimiento y los insumos no-filamento inflan el numerador del precio.

La propuesta **Logic C v3**:

1. Cada insumo (filamento y no-filamento) lleva su propio
   `replenishmentMarkupPct` — porcentaje individual que se aplica sobre el costo
   bruto del insumo para cubrir el reabastecimiento (no es ganancia, es
   recomposición de stock).
2. El **markup de ganancia** ya no se aplica sobre todo el costo: se aplica
   **solo sobre el "precio de fabricación"**, que se compone de:
   - Filamento con reab.
   - Costo de máquina (incluye energía con su propio markup).
   - Mano de obra (con su propio markup).
   - Marketing.
   - Multiplicado por `(1 + contingencia% + reinversión%)`.
3. Los **insumos no-filamento con reab.** se suman *después* del profit, antes
   de la comisión y régimen impositivo.
4. **Ganancia de bolsillo** = profit puro = `precio_fabricación × markup%`. El
   front debe mostrarla resaltada para que el usuario vea cuánto realmente queda
   en el bolsillo por unidad y por canal.

### Fórmula Logic C v3

```
filamento_con_reab     = filamento_bruto × (1 + reab_filamento%)
otros_insumos_con_reab = Σ otros_insumos_bruto_i × (1 + reab_i%)

energia_con_markup     = energia × (1 + kwh_markup_pct%)
labor_con_markup       = labor  × (1 + labor_markup_pct%)
costo_maquina          = depreciación + energia_con_markup + mantenimiento

proceso = filamento_con_reab + costo_maquina + labor_con_markup + marketing
proceso_con_provisiones = proceso × (1 + contingencia% + reinversión%)

precio_fabricacion = proceso_con_provisiones
profit             = precio_fabricacion × markup%      ← GANANCIA DE BOLSILLO

pre_comision = precio_fabricacion + profit + otros_insumos_con_reab
precio_final = pre_comision / (1 − comision% − regimen%)
```

### Default percentages

| Concepto                  | Default | Param key             |
| ------------------------- | :-----: | --------------------- |
| `replenishmentMarkupPct`  | 15 %    | columna por material  |
| `kwh_markup_pct`          | 5 %     | `GlobalParam`         |
| `labor_markup_pct`        | 5 %     | `GlobalParam`         |
| `contingency_pct`         | (existente) | `GlobalParam`     |
| `reinvestment_pct`        | (existente) | `GlobalParam`     |
| `targetMarkupPct`         | 60 %    | columna por producto  |

---

## Fase 1 — Backend (schema + cálculo)

### Schema

- [x] `apps/api/prisma/schema.prisma`:
  - Agregar `replenishmentMarkupPct Decimal @default(15) @db.Decimal(6,2)` al
    modelo `Material`.
- [x] Migración Prisma `20260507000000_replenishment_markup`:
  - `ALTER TABLE "materials" ADD COLUMN "replenishmentMarkupPct" DECIMAL(6,2) NOT NULL DEFAULT 15;`
  - Backfill explícito: `UPDATE "materials" SET "replenishmentMarkupPct" = 15;`
- [x] `INSERT … ON CONFLICT DO NOTHING` para `labor_markup_pct=5` y `kwh_markup_pct=5`.

### Parameters service

- [x] `parameters.service.ts`: `NUMERIC_KEYS` extendido con las dos keys nuevas
  + cap a 100 % en `PCT_KEYS`.

### Materials service

- [x] `materials.service.ts` + `materials.controller.ts`:
  - `MaterialDto` incluye `replenishmentMarkupPct: number`.
  - Zod input acepta `replenishmentMarkupPct` opcional (default 15, max 500).
  - Persistencia y serialización OK.
  - Variantes: la UI no envía el campo (heredan del padre).

### Machine-hour service

- [x] `machine-hour.service.ts`:
  - Lee `kwh_markup_pct` y lo aplica a la energía: `energy = energy_raw × (1 + pct)`.
  - Devuelve `energyPerHourRaw`, `energyMarkupPct` y `energyPerHour` (con markup).

### Costing calculator (rewrite)

- [x] `apps/api/src/modules/costing/costing.calculator.ts`:
  - Refactor de `compute()`:
    - **Step 1**: separar materiales en filamento (los que están enlazados a
      piezas, type=`FILAMENT`) y "otros" (los que vienen del array de
      `productMaterials`).
    - **Step 2**: para cada material, computar
      `valor_con_reab = valor_bruto × (1 + replenishmentMarkupPct/100)`.
    - **Step 3**: leer `labor_markup_pct` desde parameters; aplicar:
      `labor_eff = labor_hour_cost × horas × (1 + labor_markup_pct/100)`.
    - **Step 4**: `proceso = filamento_con_reab + costo_maquina + labor_eff + marketing`
      (marketing se mantiene sin markup propio salvo decisión contraria).
    - **Step 5**: `proceso_con_provisiones = proceso × (1 + contingency_pct/100 + reinvestment_pct/100)`.
    - **Step 6**: exponer `precio_fabricacion = proceso_con_provisiones` y
      `otros_insumos_con_reab` por separado en el `CostingResult`.
  - Nuevo shape de `CostingResult` (campos añadidos, los viejos quedan por
    compatibilidad transitoria):
    ```ts
    {
      // existentes
      filamentCost, materialsCost, machineCost, laborCost, marketingCost,
      contingency, reinvestment, totalCost,
      // nuevos
      filamentReplenishment: number;
      materialsReplenishment: number;       // Σ otros con reab
      laborMarkup: number;                  // labor × labor_markup_pct
      energyMarkup: number;                 // energía × kwh_markup_pct (informativo)
      fabricationPrice: number;             // precio_fabricacion
      otherMaterialsWithReplenishment: number; // se suma post-profit
      replenishmentBreakdown: Array<{ materialId, name, raw, withReab, pct }>;
    }
    ```
- [x] Tests `costing.calculator.spec.ts` — base case (markups=0) preserva
  resultados legacy del Excel; case "Logic C v3 con markups encendidos" valida
  reab. de filamento, reab. de insumos, recargo de obra, fabricationPrice y
  totalCost; edge cases (sin precio, sin máquina, sin unidades).

### Pricing engine

- [x] `pricing.engine.ts`:
  - `profit = fabricationPrice × markup%`.
  - `pre_commission = fabricationPrice + profit + otherMaterialsWithReplenishment`.
  - `final_price = pre_commission / (1 − commission − regime)`.
  - Nuevo input `PricingCostInputs` (cost.fabricationPrice + otros).
- [x] `pricing.service.ts` expone `fabricationPrice`, `otherMaterialsWithReplenishment`,
  `totalCost` además del legacy alias `costWithProvisions`.
- [x] Tests `pricing.engine.spec.ts` — profit fijo entre canales, profit ignora
  otros insumos (Logic C v3), commission resolution, tier overrides, detailed
  tax mode, edge cases (38 tests passing).

---

## Fase 2 — Frontend (UI + ganancia de bolsillo)

### Insumos (`/insumos`)

- [x] `material-dialog.tsx`: nuevo input "Reabastecimiento (%)" con hint
  explicativo. Variantes lo heredan del padre (campo deshabilitado). Default 15.
- [x] `materials-view.tsx`: columna combinada "Desperdicio · Reab." en la tabla.

### Parámetros globales (`/parametros`)

- [x] `parameters-form.tsx`: meta para `labor_markup_pct` y `kwh_markup_pct` con
  labels en castellano y hints explicativos. La form renderiza dinámicamente
  cualquier key devuelta por `/parameters`, así que basta con que la migración
  inserte las keys.
- [x] `machine-hour-card.tsx`: muestra "Energía (incluye +X% reab.)" cuando el
  markup está activo.

### Producto (`/productos/[id]` y `/productos/nuevo`)

- [x] `product-editor.tsx` (`CostPanel`):
  - Filas con reab. plegado (filamento, mano de obra) y subtítulos que indican
    cuánto representa el recargo.
  - Fila destacada **"Precio de fabricación"** separa lo que entra al profit
    del resto.
  - Bloque **"Otros insumos (post-profit)"** debajo si hay no-filamento.
  - Bloque verde grande **"Ganancia de bolsillo"** con el profit en pesos +
    "X% sobre fabricación · igual en todos los canales".
- [x] `product-prices.tsx`:
  - Header lleva un pill verde con la ganancia de bolsillo `/unidad`.
  - Columna de la tabla renombrada a "Ganancia de bolsillo" en verde con
    `title` tooltip.
  - Costo total + precio de fabricación visibles en la descripción.

### Cotizaciones / Producción

- [x] **Schema** + migración `20260507010000_quote_item_unit_profit`:
  `QuoteItem.unitProfit Decimal(14,2) default 0`. Snapshot al crear.
- [x] `quotes.service.ts`: `buildItemRow` y `previewItem` retornan `unitProfit`
  además de `unitPrice`. `computeUnitPrice` ahora devuelve un par.
- [x] `cotizaciones/[id]/page.tsx`: nueva columna "Ganancia unit." en verde +
  total en el footer.
- [x] `nueva-rapida` y `nueva-producto`: preview muestra ganancia/unidad.
- [x] `produccion/[id]/page.tsx`: bloque verde "Ganancia de bolsillo
  estimada" con profit/unidad y total del lote (recomputado live con
  `/products/:id/cost` y `targetMarkupPct` del producto).

### Documentación de producto (`/admin/contabilidad`)

- [x] Sección 1 reescrita para Logic C v3 con todos los componentes (filamento
  con reab., insumos extra, hora-máquina con kwh markup, mano de obra con
  recargo, marketing, precio de fabricación vs costo total). Ejemplo Cuaderno
  A5 actualizado.
- [x] Sección 2 reescrita: profit sobre fabricación, separación clara entre
  reab. (recompone) y markup (gana), diferencia explícita con Logic B.
- [x] Sección 3 (cotizaciones) menciona el nuevo `unitProfit` snapshot.

---

## Fase 3 — Migración y compatibilidad

### Datos existentes

- [x] Migración SQL deja todos los materiales con 15 %, todos los productos
  conservan su `targetMarkupPct` actual.
- [ ] Comunicar al usuario que **los precios cambian** respecto a Logic B
  (profit ya no se infla con los insumos extra). Decisión: recalibrar
  `targetMarkupPct` por producto si se quiere mantener el precio anterior.

### Compatibilidad de la API

- [x] `CostingResult` agrega campos sin remover los viejos. Aliases
  `productionCost` / `costWithProvisions` siguen disponibles (marcados como
  legacy en la doc del tipo).
- [x] `ProductPricesResponse` agrega `fabricationPrice`,
  `otherMaterialsWithReplenishment`, `totalCost`. Mantiene
  `costWithProvisions` por compat con consumidores existentes.
- [ ] Versión OpenAPI/Swagger no aplica (no hay swagger expuesto).

### Rollout (entorno local validado)

- [x] Migraciones aplicadas en docker (`20260507000000_replenishment_markup`
  y `20260507010000_quote_item_unit_profit`).
- [x] Prisma client regenerado.
- [x] Smoke test ejecutado contra el API:
  - `/parameters` lista `labor_markup_pct=5`, `kwh_markup_pct=5`.
  - `/parameters/machine-hour` expone `energyPerHourRaw`,
    `energyMarkupPct=5`, `energyPerHour` con el +5% aplicado.
  - `/materials` devuelve `replenishmentMarkupPct=15` para todos los insumos.
  - `PATCH /materials/:id` actualiza el campo.
  - `/products/:id/cost` devuelve `fabricationPrice`, `totalCost`,
    desglose con reab. por filamento y por insumo, `labor.markupAmount`.
  - `/products/:id/prices` devuelve `fabricationPrice`,
    `otherMaterialsWithReplenishment`, `totalCost`, `profitPerUnit`.
    Profit fijo entre canales verificado.
  - DB: columna `quote_items.unitProfit` existe.
- [x] Web compila las páginas modificadas (productos, parámetros, insumos,
  cotizaciones detail, producción detail).
- [ ] **Pendiente prod**: cuando se despliegue, ejecutar
  `pnpm prisma migrate deploy` en `apps/api`, reiniciar API+Web y
  hard-refresh del navegador.

---

## Convenciones

- **Markup de reabastecimiento** ≠ ganancia. Nombrar siempre como
  "reabastecimiento" o "reposición" en UI; nunca "ganancia" ni "margen".
- **Ganancia de bolsillo** es el término que ve el usuario; en código se llama
  `pocketProfit` (alias de `profit`).
- **Precio de fabricación** = `fabricationPrice` en código; en UI castellano.
- Los % nuevos se almacenan como `Decimal(6,2)` (mismo formato que markups
  existentes), serializados como `number` en JSON.
- Tests numéricos toleran ±$0.01 de error de redondeo (Prisma `Decimal` →
  `Number` puede divergir en el último decimal).

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Precios saltan al deployar y el cliente vende a pérdida | Comunicar antes; recomendar correr el calculador en staging contra el catálogo real. |
| `Material.replenishmentMarkupPct` queda en 15 pero el negocio prefería 0 | Default explícito en migración + nota en changelog para revisar. |
| El profit visible cae respecto al modelo viejo y asusta | Mostrar comparación antes/después en `/admin/contabilidad`. |
| Variantes hijas heredan o no según contexto y confunde | Documentar regla: hijo vacío → hereda; hijo con valor → override. Misma regla que costos. |

---

## Estado actual

- [x] Fase 1 (backend) completa — schema + 2 migraciones + cálculo + tests verdes (38).
- [x] Fase 2 (frontend) completa — material-dialog, parámetros, product-editor, product-prices, cotizaciones (detail + previews), producción (profit estimado del lote), doc `/admin/contabilidad`.
- [x] Fase 3 — rollout local ejecutado y verificado por smoke test contra API y Web. Pendiente del usuario: decidir recalibración de `targetMarkupPct` por producto y rollout a prod.

Cuando los tres estén tildados, este archivo se puede archivar.
