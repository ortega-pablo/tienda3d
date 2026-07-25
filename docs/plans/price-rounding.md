# Plan: Redondeo de precios finales a múltiplo de 50

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza. Cada fase tiene su
> bloque **Tests / verificación** — no pasar a la siguiente hasta verde.

## Decisiones cerradas (2026-07-22)

1. **Se redondea el PRECIO UNITARIO final** hacia arriba al siguiente múltiplo
   del paso. El total de línea se deriva como `unitario_redondeado × cantidad`
   (queda múltiplo del paso), y el **total general se redondea después del
   descuento** (porque el descuento puede romper el múltiplo). Así **todos los
   números que ve el cliente son múltiplos de 50 y consistentes entre sí**
   (línea = unitario × cantidad).
2. **Dirección: hacia arriba (ceil) siempre.** `1.234.567 → 1.234.600`. Un valor
   que ya es múltiplo del paso queda igual (ceil es idempotente). Nunca se cobra
   de menos; el excedente es margen extra.
3. **Paso configurable por global param** `price_rounding_step` (default `50`),
   editable en `/parametros`. `0` desactiva el redondeo (precios exactos).
4. **El redondeo NO afecta márgenes ni datos intermedios.** Como siempre es
   hacia arriba, el margen calculado sobre el precio exacto es un piso
   conservador (la ganancia real es ≥ la reportada). El excedente del redondeo
   (≤ `step` por unidad) es una diferencia de redondeo a favor, no contabilizada
   como margen. `profit`, `netPrice`, `effectiveMarginPct` y los costos quedan
   **exactos**; solo se redondean los valores de venta finales.

## Alcance

Redondea **solo los precios finales al cliente**, nunca los componentes de costo
(filamento, máquina, mano de obra, insumos siguen exactos internamente). Aplica a:

- Precio unitario de cada **escala** de un producto de catálogo (grilla de
  `/productos/:id` y del panel del editor), incluidos los productos tipo llavero.
- Precio unitario de cada **ítem de cotización** (PRODUCT y ADHOC, incluido el
  cotizador de llaveros y su matriz).
- **Cargo de diseño** (`designSurcharge`) — también es un precio al cliente.
- **Total general** de la cotización (tras el descuento).

## Modelo

Sea `step = price_rounding_step` (default 50). Helper puro:

```
roundPriceUp(value, step):
  if step <= 0 or value <= 0: return value        // desactivado / no-op
  return ceil(value / step) × step
```

Punto de aplicación: **solo la salida de venta final**, sin tocar el cálculo
interno. El motor de precios se mantiene **puro y exacto** (`netPrice`, `profit`,
`effectiveMarginPct` y todos los costos siguen calculados sobre el valor exacto).
Se redondea únicamente el valor de venta que se muestra y se persiste:

```
finalPriceVenta = roundPriceUp(finalPriceExacto, step)   // lo que paga el cliente
// profit, netPrice, effectiveMarginPct: SIN cambios (exactos)
```

Como el redondeo es hacia arriba, el margen exacto es un piso conservador: la
diferencia (≤ `step`) es una ganancia de redondeo no contabilizada, a favor.

El redondeo del valor de venta se aplica en cada frontera cliente: el `finalPrice`
que devuelve el motor para la grilla de producto, el `unitPrice` de cada ítem de
cotización, la matriz de llaveros, el `surcharge()` (cargo de diseño) y el
**total general** (tras el descuento). La línea se deriva del unitario ya
redondeado (`unitario × cantidad`), así que queda múltiplo del paso sola.

**Ejemplo (paso 50, unitario 1.234.567, qty 3, descuento 100.000):**

```
unitario  1.234.567 → 1.234.600
línea     1.234.600 × 3 = 3.703.800      (múltiplo de 50)
total     max(3.703.800 − 100.000, 0) = 3.603.800 → 3.603.800  (ya múltiplo)
```

## Fase 1 — Config + helper puro

- [ ] Migración `INSERT INTO global_params (key, value, ...) VALUES
      ('price_rounding_step', '50', ...) ON CONFLICT DO NOTHING`.
- [ ] `seed.ts` `seedGlobalParams()`: fila idempotente `price_rounding_step=50`.
- [ ] `parameters.service.ts`: agregar `price_rounding_step` a `NUMERIC_KEYS`
      (entero ≥ 0). NO va en `PCT_KEYS` (no es porcentaje).
- [ ] `parameters-form.tsx` `META`: entrada editable
      (`{ label: 'Redondeo de precios', suffix: '$', type: 'number', help: 'Los precios finales al cliente se redondean hacia arriba a este múltiplo. 0 = sin redondeo.' }`).
- [ ] Helper puro `roundPriceUp(value, step)` en
      `apps/api/src/modules/pricing/round-price.ts` (o util compartida).
- [ ] `PricingGlobals` (+ `loadGlobals`): agregar `roundingStep` leyendo
      `price_rounding_step` (default 50 si falta la fila).

### Tests / verificación F1
- [ ] Unit `roundPriceUp`: `1234567,50 → 1234600`; múltiplo exacto queda igual
      (`1234600 → 1234600`); `step=0` no toca; `value=0`/negativo no toca; pasos
      distintos (`100`, `10`).
- [ ] `pnpm api prisma:seed` idempotente deja `price_rounding_step=50`.
- [ ] `pnpm -r typecheck` verde.

## Fase 2 — Redondeo del valor de venta en el motor

- [ ] `pricing.engine.ts` `price()`: recibe `globals.roundingStep`; redondea
      **solo el campo `finalPrice`** hacia arriba
      (`finalPrice = roundPriceUp(netPrice × finalMultiplier, step)`).
      `netPrice`, `profit` y `effectiveMarginPct` quedan **exactos, sin tocar**.
      Con `step = 0` el comportamiento es idéntico al actual.
- [ ] `pricing.engine.ts` `surcharge()`: redondear su resultado con
      `roundPriceUp(..., step)`.

### Tests / verificación F2
Archivo: `pricing.engine.spec.ts`.
- [ ] Con `step = 0` (o ausente) los tests existentes siguen pasando (sin cambios
      de comportamiento).
- [ ] Con `step = 50`: `finalPrice` es múltiplo de 50 y ≥ al exacto.
- [ ] `profit`, `netPrice` y `effectiveMarginPct` NO cambian respecto de `step=0`
      (el redondeo no afecta márgenes ni datos intermedios).
- [ ] `surcharge` redondea su salida.
- [ ] `pnpm api test pricing`.

## Fase 3 — Totales de cotización

- [ ] `quotes.service.ts` `buildItemRow`: el `unitPrice` ya viene redondeado del
      motor; `designSurcharge` también. `lineTotal = unitPrice × qty +
      designSurcharge` queda múltiplo del paso automáticamente. Sin cambios de
      fórmula, solo verificar que no se re-redondea dos veces.
- [ ] `quotes.service.ts` `create()`: `total = roundPriceUp(max(subtotal −
      discount, 0), step)`. `subtotal` (Σ líneas redondeadas) ya es múltiplo;
      solo el descuento puede romperlo, por eso se redondea el total final.
- [ ] `previewItem` y `keychainMatrix`: heredan el redondeo (usan los mismos
      caminos) — verificar, sin cambios.

### Tests / verificación F3
- [ ] **QA/manual API**: `preview-item` de un producto → `unitPrice` múltiplo de
      50; `lineTotal == unitPrice × qty`.
- [ ] **QA/manual API**: crear cotización con descuento no múltiplo de 50 →
      `total` redondeado hacia arriba a 50.
- [ ] Matriz de llaveros: cada `unitPrice` de la matriz es múltiplo de 50.

## Fase 4 — Grilla de producto, PDF y display

- [ ] `pricing.service.ts` `forProduct`: usa el motor → grilla ya redondeada
      (base + escalas, estándar y llavero). `profitPerUnit`/`targetMarkupPct` del
      resumen son informativos (fabricación × markup) — se dejan, con nota.
- [ ] **PDF** (`pdf.service.ts`): muestra los montos persistidos (ya redondeados)
      → correcto sin cambios; verificar que no recalcula precios exactos.
- [ ] **Frontend**: no requiere lógica (muestra los números del backend).
      Opcional: nota "Precios redondeados a $50" donde se listan precios
      (grilla de producto, preview de cotización). `formatMoney` sin cambios.

### Tests / verificación F4
- [ ] `pnpm -r typecheck` / (lint queda igual que hoy).
- [ ] **QA/manual**: en `/productos/:id` los precios por escala son múltiplos de
      50 (estándar y llavero).
- [ ] **QA/manual**: PDF de una cotización nueva muestra unitarios, líneas y
      total múltiplos de 50 y consistentes (línea = unit × cant).

## Fase 5 — Verificación end-to-end

- [ ] `pnpm -r typecheck` + `pnpm api test` verdes.
- [ ] Migración aplicada (`prisma migrate deploy`) + seed.
- [ ] Smoke: cotizar producto con un unitario "feo" → redondea al siguiente 50;
      cambiar `price_rounding_step` a `0` → precios exactos; a `100` → múltiplos
      de 100.

## Edge cases

1. **`step = 0`**: redondeo desactivado, precios exactos (comportamiento actual).
2. **Valor ≤ 0**: no se toca (evita "subir" un 0 o negativos por descuento).
3. **Descuento > subtotal**: `max(..., 0)` primero, luego redondeo (0 queda 0).
4. **IVA / régimen**: el redondeo se aplica al `finalPrice`, que ya incluye IVA y
   el gross-up de comisión/régimen. Se redondea lo que efectivamente paga el
   cliente, no un valor intermedio.
5. **Margen/ganancia**: NO se tocan. `profit` y `effectiveMarginPct` quedan
   calculados sobre el precio exacto. Como el redondeo es hacia arriba, el margen
   reportado es un piso conservador (ganancia real ≥ reportada; el excedente
   ≤ `step` por unidad es una diferencia de redondeo a favor, no contabilizada).
   Consecuencia visible aceptada: en la grilla, `profit / precio_mostrado` no dará
   exactamente el `margen%` (difieren en ≤ `step`).
6. **Efecto agregado del redondeo por unidad**: con cantidades grandes, redondear
   el unitario y multiplicar puede sumar hasta `(step−1) × cantidad` sobre el
   exacto. Es la consecuencia esperada de la decisión "redondear el unitario"
   (elegida para que el precio unitario mostrado sea siempre múltiplo de 50).
7. **Cotizaciones históricas**: `unitPrice`/`lineTotal`/`total` están
   snapshoteados; no se recalculan. Solo las cotizaciones nuevas se redondean.

## Riesgos

1. **Doble redondeo**: si se redondea el unitario en el motor Y otra vez la
   línea, se puede inflar de más. Mitigación: redondear el unitario solo en el
   motor y el total solo tras el descuento; la línea nunca se re-redondea.
2. **Diferencia de redondeo no contabilizada**: el excedente (≤ `step`/unidad)
   no se refleja en `profit`. Es intencional (redondeo no afecta márgenes) y
   conservador porque siempre es a favor. Si en el futuro se quisiera trackear,
   se agregaría una línea "ajuste por redondeo" en reportes — fuera de alcance.
3. **Sorpresa al desactivar/cambiar el paso**: cambiar `price_rounding_step`
   afecta cotizaciones NUEVAS; las viejas quedan por snapshot. Comunicar al
   equipo.
