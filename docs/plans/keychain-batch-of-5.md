# Plan: Cotización de llaveros con inputs por batch

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza para que el proceso
> sea retomable.

## Decisiones cerradas (2026-05-18)

1. **`assemblyMinutes` y `managementMinutes` también se cargan por batch.** Se
   dividen por el batch size junto con piezas y materiales. Consistencia >
   pureza semántica.
2. **El badge "Valores cargados por batch de N" se muestra TAMBIÉN al cliente
   en el PDF**, no solo internamente. Transparencia total: el cliente puede
   auditar el cálculo si pregunta.
3. **El tamaño de batch es parametrizable** (no hardcodeado 5). Nuevo global
   param `keychain_batch_size` (default `5`), editable desde `/parametros`. El
   snapshot guarda el valor usado en el momento de la cotización para que
   cambios futuros no alteren cotizaciones históricas.

## Contexto

Hoy el form de cotización de llaveros (`/cotizaciones/nueva-llaveros`) reusa
el `RapidQuoteForm` de cotización a medida. Los inputs de piezas, insumos y
minutos se interpretan como **por unidad**: el motor calcula un `unitPrice`
y después el caller hace `lineTotal = unitPrice × quantity + designSurcharge`.

Eso no refleja cómo el taller produce llaveros en la realidad: una bandeja
de impresión típicamente arma **5 llaveros en una sola tirada**, así que los
gramos, minutos y consumos se miden naturalmente por batch de 5, no por
unidad. El usuario tiene los datos así y forzarlo a dividir antes de cargar
es fricción innecesaria.

## Decisión semántica

**Los inputs de la cotización de llaveros representan un batch de `N`
unidades** donde `N = keychain_batch_size` (global param, default `5`).
Esto aplica a:

- Piezas: `grams` y `printMinutes` son los **totales** para producir las
  piezas correspondientes a `N` llaveros.
- Materiales (insumos extra): `quantity` es el **consumo total** para `N`
  llaveros.
- `assemblyMinutes`, `managementMinutes`: tiempo total para los `N`.

**Excepciones que NO se dividen** (siguen siendo por línea, no por unidad
ni por batch):

- `designMinutes`: diseñar el modelo 3D es trabajo de única vez, ya está
  modelado como cargo plano (`designSurcharge`). Mantiene la semántica
  actual.

**Nota sobre el batch size y la grilla de tiers**: el batch size es
**independiente** de los `minQty` de las `KeychainTier`. Hoy las tiers
arrancan en `5, 10, 15, ...` porque el negocio cotiza de a 5; el batch
size hoy también es 5 por coincidencia operativa. Si el admin cambia
`keychain_batch_size` a 4 (porque la bandeja cambió), la grilla de tiers
sigue siendo la misma — solo cambia cómo se interpretan los inputs.

## Modelo matemático

Sea `N` el batch size leído de `keychain_batch_size` en el momento de la
cotización (no se cachea — se persiste en el snapshot, ver más abajo).

Dejamos los inputs como están y los dividimos antes de costear:

```
inputsPerUnit = { grams: grams/N, printMinutes: printMinutes/N,
                  materials.quantity: m.quantity/N,
                  assemblyMinutes: assemblyMinutes/N,
                  managementMinutes: managementMinutes/N,
                  designMinutes: designMinutes (sin tocar) }
unitPrice = engine.price(costing(inputsPerUnit), channel, productInputs,
                         globals, { markupPct: tier.markupPct }, profile)
lineTotal = unitPrice × qty + designSurcharge
```

**Verificación de linealidad** con `N = 5` (caso default):

- qty=5 → `unitPrice × 5` (1 batch)
- qty=10 → `unitPrice × 10` = 2× lo anterior ✓
- qty=100 → `unitPrice × 100` = 20× lo anterior ✓
- qty=1 → `unitPrice × 1` = 1/5 del precio para 5 ✓
- qty=3 → `unitPrice × 3` = 3/5 del precio para 5 ✓

Las dos expectativas se cumplen automáticamente porque la división por `N`
es interna y queda absorbida en `unitPrice`. **El motor y el flujo de
descuentos/comisiones no cambian.**

**Si `N` cambia**: por ejemplo, admin cambia `keychain_batch_size` de 5 a
4 (la bandeja ahora arma 4 llaveros). Cotizaciones nuevas dividen por 4;
cotizaciones viejas mantienen su `batchSize` snapshoteado y su `lineTotal`
intacto.

## Implementación recomendada (Opción A)

Dividir los inputs **antes** de pasarlos al costing service, en la rama
ADHOC de `buildItemRow` cuando `templateKind === 'KEYCHAIN'`. Esto:

1. Mantiene `unitCost`, `unitPrice` y `lineTotal` en `QuoteItem` con la
   semántica per-unidad consistente con todo el resto del sistema (ADHOC
   libre, productos del catálogo).
2. No toca el motor ni el `CostingService`.
3. No requiere nuevos campos en el schema.
4. Es invisible para PRODUCT/ADHOC libres — solo afecta el flujo keychain.

### Alternativa descartada (Opción B)

Pasar `costFor5` al motor sin dividir y cambiar el `lineTotal` a
`unitPriceFor5 × (qty/5)`. Descartado porque:

- `unitPrice` en `QuoteItem` dejaría de significar "precio por unidad" para
  cotizaciones keychain. Inconsistencia entre tipos de cotización.
- Requiere casos especiales en el PDF, el detalle, y los reports.
- Matemáticamente equivalente al approach A, así que no hay beneficio.

## Cambios concretos

### Backend (`apps/api`)

**Global param** (nuevo):

- [ ] Agregar `keychain_batch_size` a `parameters.service.ts`
  `NUMERIC_KEYS`. Validación: entero ≥ 1.
- [ ] Migración SQL: `INSERT INTO global_params ... ON CONFLICT DO NOTHING`
  con valor inicial `'5'`.
- [ ] Actualizar `seed.ts` `seedGlobalParams()`: agregar la fila idempotente.
- [ ] Actualizar `META` en `parameters-form.tsx`:
  `keychain_batch_size: { label: 'Tamaño del batch de llaveros', suffix: 'unidades', type: 'number', help: 'Cuántos llaveros entran en una bandeja de impresión. Los inputs de la cotización se interpretan como totales para este tamaño de batch.' }`.

**`quotes.service.ts` — `buildItemRow` rama ADHOC**:

- [ ] Cuando `templateKind === 'KEYCHAIN'`:
  - Cargar `N = keychain_batch_size` del global param (con default 5 si
    no existe la fila — defensive, aunque la migración garantiza que sí).
  - Construir un payload derivado con todos los valores qty-escalables
    divididos por `N` **antes** de llamar a `costing.forAdhoc()`.
    `designMinutes` queda intacto.
- [ ] Snapshot en `adhocPayload`: persistir el payload **original** (no
  dividido) más `batchSize: N` para que el PDF y el detalle muestren la
  base correcta y cotizaciones viejas no se vean afectadas si `N` cambia
  después. Los valores divididos no se persisten — solo se usan para el
  cálculo.
- [ ] El endpoint `POST /quotes/keychain-matrix` aplica exactamente la
  misma división — extraer la lógica a un helper reutilizable
  (`applyKeychainBatchDivision(payload, batchSize)`) para que matrix y
  buildItemRow usen la misma fuente de verdad.

**`quotes.types.ts`**:

- [ ] Agregar `batchSize?: number` a `AdhocItemPayload` (opcional;
  cuando ausente = per-unidad, comportamiento legacy pre-cambio).

**Tests** (`apps/api/src/modules/quotes/quotes.service.spec.ts` o similar):

- [ ] Test unitario con `N=5`: cotización keychain con `grams=25,
  printMinutes=100, qty=5` produce el mismo `lineTotal` que una cotización
  ADHOC con `grams=5, printMinutes=20, qty=5` (verificación de
  equivalencia).
- [ ] Test linealidad: keychain con `qty=10` da exactamente el doble de
  `lineTotal` que keychain con `qty=5` y los mismos inputs.
- [ ] Test prorrateo: keychain con `qty=1` da exactamente 1/5 del
  `lineTotal` de `qty=5` con los mismos inputs.
- [ ] Test: `designSurcharge` NO se divide por `N` en ningún caso.
- [ ] Test parametrización: cambiar `keychain_batch_size` a `4`, repetir
  el primer test con `grams=20, printMinutes=80, qty=4` vs ADHOC con
  `grams=5, printMinutes=20, qty=4`. Verifica que el divisor es dinámico.
- [ ] Test snapshot inmutable: crear cotización con `N=5`, cambiar param a
  `N=4`, leer cotización vieja: el `lineTotal` no cambia y el snapshot
  expone `batchSize: 5`.

### Frontend (`apps/web`)

**`nueva-llaveros/page.tsx` — header**:

- [ ] Cargar `batchSize` del endpoint `/parameters` (el server page ya
  hace varios `Promise.all`; agregar uno más).
- [ ] Mensaje explicativo arriba del form, parametrizado:
  > Los **gramos, minutos y consumos** que cargues deben ser **el total
  > para producir {batchSize} llaveros** (un batch de impresión típico).
  > El sistema divide internamente para calcular el costo por unidad.
  > Para cantidades entre 1 y {batchSize-1} el precio se prorratea; para
  > múltiplos de {batchSize} el precio escala con la cantidad.

**`rapid-quote-form.tsx` — labels (solo modo keychain)**:

- [ ] Agregar prop `batchSize: number` cuando `mode === 'keychain'`.
- [ ] Labels condicionales:
  - Pieces: "Componentes impresos (valores para {batchSize} llaveros)".
  - Materiales: "Insumos extra (cantidad para {batchSize} llaveros)".
  - Assembly/management minutes: "(para {batchSize} llaveros)".
  - Design minutes: **no cambiar** (sigue siendo "tiempo único").

**Preview de precio (modo keychain)**:

- [ ] Agregar línea adicional en el card de precio:
  > Costo por unidad: $X (= $Y / {batchSize})
- [ ] Mantener la matriz comparativa ya implementada — los precios por
  tier reflejan automáticamente el ajuste porque pasan por el mismo
  cálculo del backend.

### Detalle de cotización (`/cotizaciones/[id]`)

- [ ] En items keychain, mostrar un badge **"Valores cargados por batch
  de N llaveros"** debajo del nombre del item, leyendo `N` de
  `adhocPayload.batchSize`. Si `batchSize` está ausente (cotización
  legacy pre-cambio), no mostrar nada.

### PDF (`pdf.service.ts`)

- [ ] **Mostrar la misma nota al cliente** debajo de la descripción del
  item: "Cotización basada en batch de N unidades". Texto chico, color
  neutro. Aporta transparencia para que el cliente pueda auditar el
  cálculo si pregunta cómo se llegó al precio.

## Edge cases y validación

1. **Decimales no enteros**: `25g / 5 = 5g` está bien, pero `23g / 5 = 4.6g`
   es legítimo. El costing service ya usa Decimal-friendly math (Prisma
   Decimal), así que no rompe. **Validación**: ninguna especial; el motor
   absorbe la división.

2. **Inputs en cero**: si el usuario carga 0g o 0min, el lineTotal va a 0
   (mismo comportamiento que ADHOC libre). No cambia.

3. **`designMinutes` en cero**: comportamiento idéntico al actual.
   `designSurcharge = 0` y no aparece línea en el preview/PDF.

4. **Tier 100+**: la cantidad puede ser arbitrariamente grande (100, 105,
   ..., 500, …). El cálculo `qty/5` produce un multiplicador grande, pero
   la linealidad se mantiene.

5. **Cambio de tier en medio del form**: si el usuario carga inputs con
   `qty=5` y luego cambia a `qty=100`, el `lineTotal` cambia porque (a) el
   markup cambia al pasar de tier `5-20` a `100+`, y (b) el multiplicador
   `qty/5` cambia de 1 a 20. Ambos son comportamientos esperados.

## Migración y backward-compat

- **Cotizaciones keychain existentes en DB**: no requieren migración. Su
  `lineTotal` ya está snapshoteado (`QuoteItem.lineTotal`) y refleja el
  cálculo viejo (per-unidad). El detalle y PDF las muestran como antes
  porque `adhocPayload.batchSize` está ausente (no flag → no badge en la
  UI ni en el PDF, comportamiento legacy).
- **Cotizaciones nuevas**: usan la convención batch-de-N, marcadas con
  `batchSize: N` en el snapshot. El valor de `N` queda congelado al
  momento de crear la cotización — si el admin cambia
  `keychain_batch_size` después, las cotizaciones ya creadas mantienen su
  `batchSize` original.
- **No hay readback forzoso**: el sistema convive con los dos formatos
  porque cada cotización guarda su propio snapshot de `lineTotal` y
  `batchSize`.

## Fases ejecutables

### Fase 1 — Global param + tipos
- [ ] Migración SQL `INSERT INTO global_params (key, value, ...) VALUES
  ('keychain_batch_size', '5', ...)` con `ON CONFLICT DO NOTHING`.
- [ ] Actualizar `seed.ts` con la fila idempotente.
- [ ] `parameters.service.ts`: agregar `keychain_batch_size` a
  `NUMERIC_KEYS` con validación entero ≥ 1.
- [ ] `parameters-form.tsx`: agregar al `META` para que sea editable
  desde `/parametros`.
- [ ] Agregar `batchSize?: number` a `AdhocItemPayload` en
  `quotes.types.ts`.

### Fase 2 — Backend cálculo
- [ ] Helper `applyKeychainBatchDivision(payload, batchSize)`: devuelve
  un payload nuevo con todos los valores qty-escalables divididos
  (`grams`, `printMinutes` por pieza; `quantity` por material;
  `assemblyMinutes`, `managementMinutes`). `designMinutes` queda intacto.
- [ ] `quotes.service.ts` rama ADHOC: cuando `templateKind === 'KEYCHAIN'`,
  cargar `N` del global param, llamar al helper, pasar el resultado a
  `costing.forAdhoc()`. Persistir `batchSize: N` en el snapshot del
  `adhocPayload` (con el payload original sin dividir).
- [ ] `POST /quotes/keychain-matrix`: usar el mismo helper.
- [ ] Tests unitarios (6 tests mencionados arriba, incluyendo
  parametrización y snapshot inmutable).

### Fase 3 — Frontend
- [ ] Cargar `batchSize` en `nueva-llaveros/page.tsx` (server-side).
- [ ] Mensaje explicativo arriba del form parametrizado con `batchSize`.
- [ ] Prop `batchSize` en `RapidQuoteForm` cuando `mode === 'keychain'`.
- [ ] Labels condicionales parametrizados.
- [ ] Línea "Costo por unidad: $X (= $Y / {batchSize})" en el preview.

### Fase 4 — Detalle + PDF (cliente)
- [ ] Badge "Valores cargados por batch de N llaveros" en
  `/cotizaciones/[id]` (si `adhocPayload.batchSize` está presente).
- [ ] Nota equivalente en el PDF — visible al cliente.

### Fase 5 — QA manual
- [ ] Cotizar con `grams=25, qty=5` con `N=5` → verificar que el costo
  unitario en el preview = costo de 5g (no de 25g).
- [ ] Cotizar con `qty=10` → verificar que `lineTotal` = exactamente el
  doble que con `qty=5` (mismos inputs).
- [ ] Cotizar con `qty=1` → verificar que `lineTotal` ≈ 1/5 del de
  `qty=5` (con la salvedad del cambio de tier que afecta el markup).
- [ ] Cargar `designMinutes=30` → verificar que el cargo de diseño no se
  divide; aparece como cargo plano igual al actual.
- [ ] Cambiar `keychain_batch_size` a `4` en `/parametros`. Cotizar con
  `grams=20, qty=4`. Verificar que se divide por 4 y los labels muestran
  "para 4 llaveros".
- [ ] Abrir una cotización keychain creada antes del cambio (con `N=5`),
  luego de cambiar a `N=4`. Verificar que el badge sigue mostrando "batch
  de 5" y el `lineTotal` no cambió.
- [ ] Abrir una cotización keychain vieja pre-cambio (sin `batchSize`) →
  verificar que se muestra sin badge ni en UI ni en PDF.
- [ ] Generar PDF de cotización nueva → verificar que la nota "batch de N
  unidades" aparece debajo de la descripción del item.

## Riesgos y consideraciones

1. **Discoverabilidad**: los usuarios actuales del flujo keychain pueden
   confundirse con el cambio de semántica. Mitigación: mensaje explícito
   arriba del form, labels actualizados con el `batchSize` actual, ejemplo
   en el help text.

2. **Cambio implícito de precio en cotizaciones nuevas**: alguien que
   cargue `grams=5` (como antes, esperando per-unidad) ahora producirá un
   precio `N×` menor del esperado porque el sistema lo va a interpretar
   como "5g para N unidades". Mitigación: mensaje explícito + placeholder
   sugerido en el input ("p.ej. 25 para un batch de 5 llaveros").

3. **Mezcla con otros tipos de cotización**: el cambio solo afecta al
   flujo keychain (cuando `templateKind === 'KEYCHAIN'`). PRODUCT y ADHOC
   libre quedan iguales. Verificar en QA que no se mezclen.

4. **Matrix endpoint** (`POST /quotes/keychain-matrix`): tiene que aplicar
   la misma división con el mismo `batchSize`. Por eso el helper
   `applyKeychainBatchDivision` es compartido — única fuente de verdad.

5. **Cambio del batch size con cotizaciones en curso**: si el admin baja
   `keychain_batch_size` de 5 a 4 mientras un vendedor está armando una
   cotización en el form, el server-side page ya cargó `N=5` pero al
   guardar el backend va a usar `N=4` (lee fresco). Es una rareza
   esquinosa pero el snapshot del payload final será coherente con lo
   guardado. Mitigación: para v1, asumir que cambios al batch size son
   raros y comunicar al equipo. Si pasa a ser un problema, pasar el
   `batchSize` actual como parte del payload al crear la cotización.

## Alternativas para considerar (no en este plan)

- **Toggle "por unidad / por batch"**: agregar un selector en el form para
  que el usuario decida la base. Más flexible pero más complejo. Dejar
  para una iteración futura si surge la necesidad real.

- **Batch size por tier**: hoy hay un solo `keychain_batch_size`. Si en
  el futuro el negocio quiere "bandeja de 5 para tier 5-20, bandeja de 10
  para tier 100+", se podría mover el batch a la `KeychainTier`. Por
  ahora un valor global es suficiente.
