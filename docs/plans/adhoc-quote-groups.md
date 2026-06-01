# Plan: Cotización a medida con grupos

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza para que el
> proceso sea retomable.

## Contexto

Hoy `cotización a medida` (`/cotizaciones/nueva-a-medida`) produce
**una sola** `ADHOC` `QuoteItem` con todo el contenido del form: piezas,
insumos, armado, gestión, diseño. El motor calcula un único `unitPrice`
y un único `lineTotal = unitPrice × quantity + designSurcharge`.

Cuando el vendedor quiere cotizar **varias cosas distintas en una sola
cotización** (ej. "5 llaveros + 1 jarrón + 2 portamacetas"), hoy
tiene que:

- Hacer 3 cotizaciones separadas (mala UX para el cliente, que recibe
  3 PDFs distintos), o
- Mezclar todo en una sola cotización donde el cliente no ve qué cuesta
  cada cosa.

## Decisión: grupos como bundles libres

El vendedor podrá **agrupar** piezas e insumos del form en bundles, y
**cada grupo se cotiza como un item separado** en la misma cotización.
El resultado: una cotización con N items ADHOC, cada uno con su propio
precio y línea en el PDF.

Por design:

- El **grupo es solo una etiqueta del frontend**. No se persiste como
  entidad — solo se usa para partir el payload en N items al guardar.
- Cada item ADHOC resultante usa el mismo motor de pricing que hoy: el
  cálculo no cambia, solo cambia cuántos items se mandan al backend.

## Decisiones cerradas (2026-05-22)

1. **Armado y gestión por grupo, diseño global.** Cada grupo lleva sus
   propios `assemblyMinutes` / `managementMinutes` (porque armás cada
   bundle por separado). El `designMinutes` es del **proyecto entero**
   — un solo modelo 3D que cobrás una sola vez. El cargo de diseño
   se snapshotea en uno solo de los items (el primero) y el resto
   queda en 0.
2. **Piezas/insumos sin grupo asignado → "grupo adicional"
   automático.** El vendedor no está obligado a asignar todo
   manualmente. Lo que quede huérfano al guardar se bundle en un grupo
   extra. Esto preserva el flujo actual: si nadie crea grupos, todo
   termina en ese único grupo adicional = el comportamiento de hoy.

## Modelo conceptual

```
Form state (cliente):
  pieces:    [{ id, name, grams, printMinutes, filamentId, groupId? }]
  materials: [{ materialId, quantity, groupId? }]
  groups:    [{ id, name, assemblyMinutes, managementMinutes }]
  designMinutes: number     ← global, queda fuera de los grupos

Al guardar, el frontend transforma el state en:
  items: [
    { type: 'ADHOC', description: groupA.name, payload: { pieces de A, materials de A, assemblyMinutes de A, managementMinutes de A, designMinutes: <todo aquí> } },
    { type: 'ADHOC', description: groupB.name, payload: { pieces de B, materials de B, assemblyMinutes de B, managementMinutes de B, designMinutes: 0 } },
    { type: 'ADHOC', description: 'Grupo adicional', payload: { pieces sin asignar, materials sin asignar, assemblyMinutes: 0, managementMinutes: 0, designMinutes: 0 } }   ← si hay huérfanos
  ]
```

**El backend no requiere ningún cambio**: el endpoint `POST /quotes` ya
acepta arrays de items, y `buildItemRow` ya itera y calcula cada uno
independientemente.

## Reglas operativas

1. **Grupo "Adicional" auto-creado**: solo aparece si hay piezas o
   insumos sin asignar. Si todo está asignado a grupos manuales, no se
   crea ese grupo extra.
2. **Cantidad por grupo**: cada grupo lleva su propia `quantity`. La
   "cantidad global" del form pasa a ser la cantidad del grupo 1 por
   default; cuando hay multi-grupo, cada grupo expone su input.
3. **Diseño global**: el `designMinutes` que carga el vendedor (cargo
   plano de proyecto) se snapshotea en el **primer grupo no vacío** del
   array de items. Los demás llevan `designMinutes: 0`, `designSurcharge: 0`.
   Esto evita que se facture diseño N veces.
4. **Grupo vacío**: si un grupo manual no tiene ni piezas ni insumos
   asignados, se ignora silenciosamente al guardar. Validación cliente:
   al menos un grupo debe tener contenido.
5. **PDF / detalle**: cada item ADHOC se ve como una línea separada
   con su nombre de grupo como descripción. El detalle muestra:
   "Grupo A: …", "Grupo B: …", "Grupo Adicional: …".

## Cambios concretos

### Frontend — `rapid-quote-form.tsx` (modo `adhoc`)

- [ ] Nuevo state `groups: GroupDraft[]` que arranca con un solo grupo
  default (`[{ id: 'g1', name: 'Grupo 1', assemblyMinutes: '0', managementMinutes: '0', quantity: '1' }]`).
- [ ] Cada `PieceDraft` y `MaterialDraft` lleva un campo opcional
  `groupId: string | null`. Default `null` (= sin asignar, va al grupo
  adicional al guardar). Cuando solo existe el grupo default, los nuevos
  ítems se asignan a él automáticamente.
- [ ] UI:
  - [ ] Botón "Agregar grupo" arriba del listado de piezas. Cada grupo
    aparece con su nombre editable y sus campos de armado/gestión/qty.
  - [ ] Botón "Eliminar grupo" por grupo (re-asigna los items huérfanos
    a `null`).
  - [ ] Selector `groupId` en cada fila de pieza/insumo: dropdown con
    los grupos existentes + opción "Sin asignar".
  - [ ] La sección "Tiempos del lote" desaparece cuando hay multi-grupo:
    cada grupo tiene los suyos. El input "Tiempo de diseño" se queda
    como global con etiqueta "Diseño del proyecto (cargo único)".
- [ ] Builder al guardar:
  - [ ] Por cada grupo con contenido (manual o adicional), construir un
    `ADHOC` item con `description: group.name`, `quantity: group.quantity`,
    `payload: { pieces, materials, assemblyMinutes, managementMinutes,
    designMinutes }`.
  - [ ] El primer item recibe el `designMinutes` del form; los demás
    `0`.
  - [ ] Si hay piezas/insumos con `groupId === null`, agregar al final
    un item "Grupo Adicional" con esos.
- [ ] Validación:
  - [ ] Al menos un grupo (manual o adicional) debe tener
    `pieces.length > 0 || materials.length > 0`.
  - [ ] Cada grupo con contenido necesita un nombre no vacío.
  - [ ] Cantidad de cada grupo: misma regla que hoy (`> 0`).

### Frontend — preview de precio

- [ ] El preview actual muestra "Precio unitario / Costo unitario / Total
  para qty=N". Con multi-grupo eso ya no tiene sentido — el preview
  pasa a mostrar:
  - [ ] Una tabla con una fila por grupo: nombre, cantidad, costo
    unitario, precio unitario, subtotal.
  - [ ] Una fila final con el cargo único de diseño.
  - [ ] El total general como hoy.
- [ ] El cálculo del preview hace **un fetch a `/quotes/preview-item`
  por grupo** (no batch). Es N llamadas pero los grupos rara vez serán
  más de 3-5; performance OK.

### Frontend — detalle y PDF de cotización

- [ ] Detalle (`clientes/[id]/cotizaciones/[id]`): cada grupo ya aparece
  como una fila en la tabla de items. **No requiere cambio** — el
  componente ya itera `quote.items`.
- [ ] PDF (`apps/api/src/modules/quotes/pdf.service.ts`): igual al
  detalle, cada item es una fila. **No requiere cambio**.

### Backend

**No requiere cambios** porque:

- El endpoint `POST /quotes` ya acepta arrays de items.
- `buildItemRow` ya construye una row por item.
- El motor de pricing ya itera y aplica `designSurcharge` por item
  (con cero designMinutes pasa a `designSurcharge: 0` natural).

Posibles ajustes menores si surgen en QA:

- [ ] (opcional) Mensaje de error más claro en `previewItem` cuando un
  payload tiene `pieces: []` Y `materials: []` Y todos los minutos en 0
  — es un grupo vacío que debería filtrar el frontend pero quizá llegue.

## Fases ejecutables

### Fase 1 — Estructura de state + UI básica

- [ ] Refactor del `rapid-quote-form.tsx` (modo `adhoc` solamente, sin
  tocar el modo `keychain`):
  - [ ] Nuevo state `groups`, `groupId` en piece/material drafts.
  - [ ] Render del listado de grupos con nombre editable, qty, minutos
    armado, minutos gestión por grupo.
  - [ ] Selector de grupo en cada pieza/insumo.
- [ ] Cuando hay un solo grupo (default), el form debe verse
  prácticamente igual a hoy — los campos de tiempos quedan dentro del
  card del grupo 1.

### Fase 2 — Builder del payload + validación

- [ ] `buildItems()` genera el array de items ADHOC desde el state.
- [ ] Lógica de "grupo adicional" para huérfanos.
- [ ] Validación: nombre obligatorio en grupos con contenido, mínimo
  un grupo con contenido.
- [ ] Diseño se asigna solo al primer item.

### Fase 3 — Preview multi-grupo

- [ ] `calc()` itera grupos, hace N llamadas a `/quotes/preview-item`,
  arma tabla.
- [ ] Total general = suma de los `lineTotal` + `designSurcharge`.

### Fase 4 — QA manual

- [ ] Cotización con un solo grupo (sin tocar el botón "Agregar grupo")
  → resultado idéntico al de hoy (un solo item en el PDF).
- [ ] Cotización con 2 grupos manuales + 1 huérfano → 3 items en el
  PDF, cada uno con su precio. Cargo de diseño aparece solo en el
  primero.
- [ ] Eliminar un grupo con contenido → los items quedan huérfanos y
  caen al grupo adicional. Sin pérdida de data.
- [ ] Renombrar un grupo → se refleja en el preview, el detalle y el
  PDF.
- [ ] Grupo sin nombre → bloquea el guardado.
- [ ] Modo `keychain` (cotización de llaveros): no se ve afectado, no
  expone grupos.

## Riesgos y consideraciones

1. **Discoverabilidad del feature**: la mayoría de los usos van a ser
   "1 grupo, todo junto" (caso de hoy). El botón "Agregar grupo" tiene
   que ser visible pero no estorbar — sugerido al lado del header de
   "Componentes impresos".

2. **El designSurcharge solo en el primer grupo**: si el vendedor mira
   el detalle de la cotización, puede sorprenderse de que el cargo
   aparece "pegado" al primer grupo en lugar de a uno separado. Mitigar
   con label explícito en el PDF y detalle: "Incluye cargo único de
   diseño del proyecto".

3. **Performance del preview con N grupos**: cada grupo dispara una
   llamada a `/quotes/preview-item`. Con 10 grupos serían 10
   llamadas — aceptable. Si surge problema, batchear en un endpoint
   `POST /quotes/preview-items` (plural) más adelante.

4. **Grupos vacíos en el state pero válidos en el form**: si el vendedor
   crea "Grupo 2" pero no le asigna nada y guarda, debería filtrarse.
   Validación cliente: solo se construyen items para grupos con
   contenido.

5. **Backend recibe varios items**: hay que verificar que el código
   actual de `buildItemRow` para ADHOC maneja correctamente N items
   secuencialmente. La rama keychain también — si en el futuro keychain
   acepta multi-grupo (no es alcance de este plan).

6. **Snapshot histórico**: cotizaciones antiguas (single-item) se
   visualizan sin cambios. Las nuevas multi-grupo aparecen con los
   items separados — el frontend de detalle ya itera, no requiere
   conditional.

## Fuera de alcance

- **Persistir grupos como entidad**: hoy es solo etiqueta del frontend.
  Si en el futuro se quiere reportar "cuánto se cotizó de cada grupo
  agrupando por nombre", habría que persistir el nombre en
  `QuoteItem.description` (que ya lo hace) — basta para reports.
- **Grupos en cotización de llaveros**: el modo keychain tiene grilla
  fija y tier-based pricing. Mezclar con grupos requiere otro plan.
- **Reordenamiento de grupos**: drag-and-drop entre grupos sería lindo
  pero agrega complejidad. Por ahora, solo el dropdown.
- **Plantillas de grupos**: guardar combinaciones frecuentes ("Set de
  3 llaveros con anillo") como plantilla — futuro feature, no este plan.
