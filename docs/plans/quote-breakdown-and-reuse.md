# Plan: Desglose de cálculo (admin) + Re-cotizar desde una cotización

> Plan vivo y **autocontenido** (pensado para ejecutarse tras compactar la
> conversación). Marcar tareas con `[x]` a medida que se avanza. Cada fase tiene
> su bloque **Tests / verificación** — no pasar a la siguiente hasta verde.

## Objetivo

Dos features independientes sobre cotizaciones, para **todos los formatos**:
producto de catálogo estándar, producto de catálogo **tipo llavero**, a medida
libre (ADHOC) y **llavero ADHOC** (`templateKind: 'KEYCHAIN'`).

- **F-A — Re-cotizar**: desde una cotización existente, crear una nueva usando sus
  valores como base (idéntica o editando ítems). Alto valor, bajo riesgo.
- **F-B — Desglose de cálculo (admin)**: ver, por ítem, el desglose completo
  (costo + precio: filamento, máquina, mano de obra, contingencia, reinversión,
  markup, comisión, régimen, IVA) como en el panel de un producto de catálogo.
  **Vía snapshot al crear** (fiel al precio congelado).

Son independientes; recomendado ejecutar **F-A primero** (no toca backend de
datos) y **F-B después**.

---

## Estado actual del código (contexto para ejecutar)

### Qué se persiste hoy por ítem
`QuoteItem` (Prisma) y `QuoteItemDto`
([quotes.types.ts:3-14](../../apps/api/src/modules/quotes/quotes.types.ts#L3-L14))
guardan **solo totales**: `productId`, `description`, `quantity`, `unitCost`,
`unitPrice`, `unitProfit`, `lineTotal`, `adhocPayload`.

El desglose completo se calcula en
[quotes.service.ts `buildItemRow`](../../apps/api/src/modules/quotes/quotes.service.ts#L485)
vía `costing.forProduct/forAdhoc` (→ `CostingResult`) + `computeUnitPrice` (→
`PriceLine` interno) y **se descarta**: solo sobreviven `unitCost = cost.totalCost`,
`unitPrice = line.finalPrice`, `unitProfit = line.profit`.
`computeUnitPrice` ([quotes.service.ts:736](../../apps/api/src/modules/quotes/quotes.service.ts#L736))
hoy devuelve solo `{ unitPrice, unitProfit, designSurcharge }`.

### Shapes que ya existen (a reutilizar/persistir)
- **`CostingResult`** ([costing.types.ts](../../apps/api/src/modules/costing/costing.types.ts)):
  `filament{items,raw,waste,replenishment,totalWithReplenishment,totalMinutes}`,
  `materials{...}`, `machine{minutes,perHour,total}`,
  `labor{minutes,markupPct,markupAmount,total}`, `marketing{monthly,units,perUnit}`,
  `contingency`, `reinvestment`, `fabricationPrice`, `totalCost`.
- **`PriceLine`** ([pricing.types.ts:121-141](../../apps/api/src/modules/pricing/pricing.types.ts#L121-L141)):
  `markupPct`, `commissionPct`, `taxBurdenPct`, `denominator`, `netPrice`,
  `finalPrice`, `profit`, `effectiveMarginPct`, `missingCommission`, `warnings`.
- **`adhocPayload`** (solo ADHOC) ya guarda los INPUTS sin dividir: `pieces` (tanda),
  `individualPieces`, `materials`, `assemblyMinutes`, `managementMinutes`,
  `designMinutes`, `templateKind`, `batchSize`, y snapshots informativos
  (`appliedMarkupPct`, `tierLabel`, `pricingBase`, `designSurcharge`).

### Componentes de desglose ya construidos (a reutilizar en F-B)
- `CostBreakdown` en
  [productos/[id]/product-editor.tsx:1108-1194](../../apps/web/src/app/(protected)/productos/[id]/product-editor.tsx#L1108)
  (filamento/máquina/obra/marketing/contingencia/reinversión/fabricación/insumos/total).
- `ProductPrices` en
  [productos/[id]/product-prices.tsx](../../apps/web/src/app/(protected)/productos/[id]/product-prices.tsx)
  (tabla markup/comisión/régimen/precio por escala).

### Cotizaciones — detalle y forms
- Detalle: [cotizaciones/[id]/page.tsx](../../apps/web/src/app/(protected)/cotizaciones/[id]/page.tsx)
  (muestra los 4 totales + itemizado sin precios) y
  [cotizaciones/[id]/quote-actions.tsx](../../apps/web/src/app/(protected)/cotizaciones/[id]/quote-actions.tsx)
  (PDF, estados, eliminar — **sin** duplicar).
- Forms de alta (arrancan **vacíos**, sin prefill):
  - Producto: `ProductQuoteForm`
    ([nueva-catalogo/product-quote-form.tsx](../../apps/web/src/app/(protected)/cotizaciones/nueva-catalogo/product-quote-form.tsx)).
  - A medida / llavero: `RapidQuoteForm`
    ([nueva-a-medida/rapid-quote-form.tsx](../../apps/web/src/app/(protected)/cotizaciones/nueva-a-medida/rapid-quote-form.tsx)),
    con `mode: 'adhoc' | 'keychain'`. La página de llaveros
    ([nueva-llaveros/page.tsx](../../apps/web/src/app/(protected)/cotizaciones/nueva-llaveros/page.tsx))
    usa `mode="keychain"`.
- `GET /quotes/:id` ([quotes.service.ts:103-110](../../apps/api/src/modules/quotes/quotes.service.ts#L103))
  → `toDto` devuelve `items` con `productId`, `quantity`, `adhocPayload` completos.
- Crear: `POST /quotes` (schema en
  [quotes.controller.ts](../../apps/api/src/modules/quotes/quotes.controller.ts)),
  ítems `ProductItemInput { type:'PRODUCT', productId, quantity }` o
  `AdhocItemInput { type:'ADHOC', description, quantity, payload }`.

---

## Decisiones cerradas (2026-07-22)

1. **F-B usa snapshot al crear** (no recalcular): el desglose se guarda por ítem
   al crear la cotización, para que cuadre siempre con el total firmado aunque
   luego cambien costos/parámetros. Cotizaciones viejas (sin snapshot) muestran
   "desglose no disponible" (o, opcional, recálculo etiquetado — Fase B4).
2. **F-B es solo para admin**: el panel de desglose se muestra detrás de permiso.
3. **F-A recalcula precios frescos**: al re-cotizar se reconstruyen los INPUTS
   (no se reusan los precios viejos); el precio se recomputa al previsualizar/
   guardar. Todos los formatos soportados.
4. Ambas features cubren los 4 formatos.

---

# Feature A — Re-cotizar (usar una cotización como base)

Sin cambios de datos en backend: todos los inputs ya están en `QuoteDto`. Se
reconstruyen los inputs y se reusa `POST /quotes`.

## Fase A1 — Botón "Usar como base" + ruteo por tipo

- [ ] En `quote-actions.tsx`: botón **"Usar como base"** (visible con
      `quote:create`). Navega a la página de alta correspondiente con
      `?from=<quoteId>`, eligiendo destino por formato:
  - `type === 'PRODUCT'` → `/cotizaciones/nueva-catalogo?from=<id>`
  - `type === 'ADHOC'` con algún ítem `templateKind === 'KEYCHAIN'` →
    `/cotizaciones/nueva-llaveros?from=<id>`
  - `type === 'ADHOC'` (resto) → `/cotizaciones/nueva-a-medida?from=<id>`
- [ ] La detección de keychain reutiliza `templateKind` del `adhocPayload` (ya
      derivado como `QuoteSummaryDto.templateKind`).

### Tests / verificación A1
- [ ] El botón aparece solo con permiso `quote:create`.
- [ ] Cada tipo de cotización navega a la página correcta con `?from`.

## Fase A2 — Prefill server-side + prop `initialState` en los forms

- [ ] Las páginas de alta (`nueva-catalogo/page.tsx`, `nueva-a-medida/page.tsx`,
      `nueva-llaveros/page.tsx`) leen `searchParams.from`; si está, hacen
      `GET /quotes/:from` server-side y pasan `initialState` al form. Sin `from`,
      comportamiento actual (vacío).
- [ ] `ProductQuoteForm`: aceptar prop `initialState?` y, si viene, inicializar
      `items` = `quote.items.map(i => ({ productId, quantity }))`, más cliente
      (`customerId` + textos), `withInvoice` (derivado del canal), `discount`,
      `notes`, `validUntil`.
- [ ] `RapidQuoteForm`: aceptar prop `initialState?`. Reconstrucción:
  - **ADHOC libre**: cada `QuoteItem` = un **grupo** (el builder parte el payload
    en N ítems = N grupos). Mapear `adhocPayload` → `pieces`/`materials`/minutos
    con su `groupId`; `quantity` por grupo; `designMinutes` global = Σ de los
    ítems (el diseño se asignó a un solo ítem al guardar).
  - **Llavero ADHOC** (`mode="keychain"`): 1 grupo. Mapear `pieces` (tanda) e
    `individualPieces` (individual) a sus dos secciones, `materials`, minutos,
    `quantity`, `templateKind: 'KEYCHAIN'`.
  - Campos snapshot de salida (`designSurcharge`, `appliedMarkupPct`, `tierLabel`,
    `pricingBase`) se ignoran — se recalculan.

### Tests / verificación A2
- [ ] `pnpm web typecheck` verde.
- [ ] **QA manual**: re-cotizar un PRODUCT estándar → form precargado con los
      mismos productos/cantidades/cliente; guardar produce una cotización nueva
      (código nuevo, estado DRAFT) con precios recalculados.
- [ ] **QA manual**: re-cotizar un producto **tipo llavero** → cantidades y
      producto correctos; el precio usa la escala correspondiente a la cantidad.
- [ ] **QA manual**: re-cotizar **a medida libre multi-grupo** → se reconstruyen
      los grupos con sus piezas/insumos/minutos.
- [ ] **QA manual**: re-cotizar **llavero ADHOC** → dos secciones (individual +
      tanda) precargadas, cantidad y markup por escala correctos.
- [ ] **QA manual (editar)**: cambiar una cantidad/insumo antes de guardar y
      verificar que la nueva cotización refleja el cambio.

## Fase A3 — Edge cases de re-cotizar

- [ ] **Producto inactivo/eliminado** (PRODUCT): si un `productId` ya no existe o
      está inactivo, marcar la fila y permitir quitarla; no romper el form.
- [ ] **Filamento/insumo inactivo/eliminado** (ADHOC): si un `filamentId`/
      `materialId` del payload ya no está en el catálogo activo, avisar en la fila
      (el `<select>` no lo tendrá) y permitir corregir antes de guardar.
- [ ] **Cliente inactivo/eliminado**: si `customerId` ya no es válido, dejar los
      textos pero limpiar la referencia.

### Tests / verificación A3
- [ ] **QA manual**: re-cotizar una cotización que referencia un producto
      desactivado → el form avisa y permite continuar sin ese ítem.

---

# Feature B — Desglose de cálculo por ítem (admin, snapshot al crear)

## Fase B1 — Persistir el desglose al crear

- [ ] Schema: `QuoteItem.pricingBreakdown Json?` (nullable — ítems viejos = null).
      Migración aditiva.
- [ ] `computeUnitPrice` ([quotes.service.ts:736](../../apps/api/src/modules/quotes/quotes.service.ts#L736)):
      además de `{ unitPrice, unitProfit, designSurcharge }`, devolver el
      `PriceLine` completo (y el `designSurcharge` line si aplica).
- [ ] `buildItemRow`: para **todos los caminos** (PRODUCT estándar, PRODUCT
      llavero, ADHOC libre, ADHOC llavero) armar y persistir `pricingBreakdown`:
  - `cost`: el `CostingResult` usado (para llavero, el de la base elegida —
    INDIVIDUAL o BATCH÷batchSize — que ya se calcula en la rama).
  - `price`: el `PriceLine` (markup, comisión, régimen/burden, denominador,
    netPrice, finalPrice, profit, margen efectivo).
  - `context`: `channelName`, flags de cliente aplicados
    (skipChannelCommission/Marketing/Regime/Reinvestment), y para llavero
    `pricingBase` (INDIVIDUAL/BATCH), `scaleLabel`, `scaleMarkupPct`, `batchSize`.
  - `designSurcharge` (si aplica) con su desglose de comisión/régimen.
- [ ] Definir el tipo `QuoteItemPricingBreakdown` en `quotes.types.ts` y usarlo al
      persistir (`Prisma.InputJsonValue`) y en el DTO.

### Tests / verificación B1
- [ ] `pnpm -r typecheck` + `pnpm api test` verdes.
- [ ] **QA manual (API)**: crear cotización de cada formato → `GET /quotes/:id`
      devuelve `items[].pricingBreakdown` con costo + precio coherentes; la suma
      `cost.fabricationPrice`-based reproduce el `unitPrice` persistido.
- [ ] **QA manual**: para un ítem llavero, el breakdown indica la base usada
      (individual vs tanda÷N) y el markup de la escala aplicada.

## Fase B2 — Exponer en el DTO detrás de permiso

- [ ] `QuoteItemDto`: agregar `pricingBreakdown?: QuoteItemPricingBreakdown | null`.
- [ ] Gate de permiso: el desglose se incluye/renderiza solo si el usuario tiene
      el permiso de admin elegido (**decisión**: reusar `parameter:read` — que ya
      guarda config sensible y lo tienen los admins — o agregar
      `quote:cost:read`). Recomendado: reusar `parameter:read` para no migrar
      permisos; si se quiere granularidad, agregar el permiso dedicado.
- [ ] El `get()` del service puede devolver el campo siempre; el **gate real**
      vive en la página (no renderiza el panel sin permiso) para no filtrarlo en
      la respuesta a roles sin acceso — preferible filtrarlo también en el DTO
      según el usuario.

### Tests / verificación B2
- [ ] **QA manual**: usuario admin ve el desglose; usuario sin el permiso no lo
      recibe/ve.

## Fase B3 — UI del panel de desglose en el detalle

- [ ] En `cotizaciones/[id]/page.tsx`: por cada ítem, un bloque colapsable
      **"Ver desglose (admin)"** que renderiza:
  - Desglose de **costo** reutilizando/adaptando `CostBreakdown`
    (filamento, máquina, mano de obra, marketing, contingencia, reinversión,
    fabricación, insumos, total).
  - Desglose de **precio**: markup aplicado, comisión, régimen/IVA, netPrice,
    precio final, ganancia y margen efectivo (tabla estilo `ProductPrices`, pero
    de una sola línea = el ítem cotizado, no la grilla de escalas).
  - Para llavero: nota de base (individual / tanda÷N) y escala aplicada.
- [ ] Extraer los componentes de desglose a un lugar compartido si hace falta
      (hoy viven en `product-editor.tsx` / `product-prices.tsx`) para reusarlos
      sin duplicar.
- [ ] Solo se muestra si `item.pricingBreakdown` existe (snapshot presente).

### Tests / verificación B3
- [ ] `pnpm web typecheck` verde.
- [ ] **QA manual**: abrir una cotización nueva de cada formato como admin →
      el desglose por ítem cuadra con `unitPrice`/`unitProfit`/`lineTotal`
      mostrados arriba.

## Fase B4 — (Opcional) Fallback para cotizaciones viejas

- [ ] Para ítems con `pricingBreakdown == null` (previos a B1): o bien mostrar
      "Desglose no disponible (cotización previa a esta función)", o bien un
      endpoint `GET /quotes/:id/items/:itemId/breakdown` que **recalcula** con
      costos/params actuales, claramente etiquetado "recalculado — puede diferir
      del precio congelado". Recomendado: empezar con el mensaje y evaluar el
      recálculo después.

### Tests / verificación B4
- [ ] **QA manual**: cotización vieja muestra el mensaje (o el recálculo
      etiquetado, si se implementa).

---

## Edge cases (ambas features)

1. **Cotización con descuento**: al re-cotizar se puede copiar el `discount` o
   arrancar en 0 (decisión menor — recomendado copiarlo y que el usuario ajuste).
2. **Redondeo de precios** (`price_rounding_step`): F-B muestra el desglose; el
   `finalPrice`/`unitPrice` ya vienen redondeados. El desglose de costo es exacto;
   aclarar en el panel que el precio final se redondeó (diferencia = ganancia de
   redondeo, no contabilizada en `profit`).
3. **Cotización mixta**: no existen (las cotizaciones son homogéneas PRODUCT o
   ADHOC), así que el destino de re-cotizar es siempre inequívoco.
4. **Llavero — base por cantidad**: al re-cotizar, si el usuario cambia la
   cantidad, la base (individual vs tanda) y la escala se recalculan solas.

## Riesgos

1. **Reconstrucción de grupos en `RapidQuoteForm`** (F-A) es la parte más
   delicada: el builder parte el payload en N ítems al guardar; hay que invertir
   ese mapeo. Mitigación: cada `QuoteItem` ADHOC ya corresponde a un grupo; el
   `description` del ítem es el nombre del grupo.
2. **Tamaño del snapshot** (F-B): `pricingBreakdown` agrega un JSON por ítem.
   Aceptable (los ítems son pocos por cotización).
3. **Doble fuente de verdad** en F-B: el snapshot puede divergir de un recálculo
   posterior — es intencional (el snapshot es la verdad del documento).
4. **Filtrado del desglose por permiso**: asegurarse de no filtrar `pricingBreakdown`
   en la respuesta a usuarios sin permiso (no solo ocultarlo en la UI).

## Orden recomendado de ejecución

1. **F-A** completa (A1 → A3): valor inmediato, sin migración.
2. **F-B** (B1 → B3), B4 opcional después.
