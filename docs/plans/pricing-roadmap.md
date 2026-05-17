# Roadmap maestro: pricing de Plastik 3D

> Documento índice. Vive arriba de los planes detallados y conecta los hilos
> para no perder contexto entre fases. Actualizar al cerrar cada plan.

## Por qué este documento existe

El sistema de precios se está reescribiendo en varias capas (motor → tiers →
catálogo → cotizaciones → portal del cliente). Cada plan ataca una pieza, pero
**todos comparten la misma resolución de precio** y se cruzan en superficies
visibles al staff y al cliente. Sin un mapa, es fácil terminar con dos planes
que se contradicen o con una superficie que se queda atrás.

El roadmap responde tres preguntas:
1. ¿Qué planes están vivos y en qué estado?
2. ¿Qué cambios en la base impactan en qué superficies de UI?
3. ¿Qué hay que mirar primero antes de tocar código de la próxima fase?

## Cambio que dispara este roadmap

**Las escalas pasan de producto a categoría/subcategoría** (plan
[`category-driven-pricing.md`](./category-driven-pricing.md)). Eso fuerza a
revisar cómo se resuelve el markup en TODOS los flujos de pricing — incluyendo
los específicos por tipo de cliente que ya entregamos.

### Sí, impacta a los precios por tipo de cliente

Hoy `CustomerPricingService.forCustomerProduct(customerId, productId)`
([customer-pricing.service.ts:92](../apps/api/src/modules/customers/customer-pricing.service.ts#L92))
hace `prisma.productPriceTier.findMany({ where: { productId } })`. Al
eliminarse esa tabla:

- **Resolución de tier** pasa a `CategoryPriceTier` con fallback subcategoría → padre.
- **`customer.minTierQty`** (piso de tier por categoría para WHOLESALE)
  sigue siendo `categoryId`-based, pero ahora `mergeTiersBelowFloor` recibe
  tiers de categoría, no de producto. **Mismo algoritmo, distinta fuente**.
- **`customer.customMarkupPct`** (override por cliente SPECIAL) sigue ganando
  precedencia: pisa la tier de categoría como pisaba la del producto.
- **`skipChannelCommission` / `skipRegime`** (CONSIGNACIÓN, ESPECIAL):
  no se tocan — son flags del motor, ortogonales a la fuente de tier.
- **Matriz de precios por cliente** (`/clientes/:id/precios/:productId`,
  [customer-price-matrix.tsx](../apps/web/src/app/(protected)/clientes/[id]/customer-price-matrix.tsx))
  consume el mismo endpoint → cambia internamente sin romper la UI, pero hay
  que validar visualmente que las tiers heredadas se vean como esperás.

## Planes vivos

| Plan | Foco | Estado | Bloqueado por |
|---|---|---|---|
| [`costing-model-logic-c-v3.md`](./costing-model-logic-c-v3.md) | Modelo de costeo (provisiones por insumo, profit sobre fabricación) | ✅ Implementado | — |
| [`customer-types-and-pricing.md`](./customer-types-and-pricing.md) | 4 tipos de cliente, flags, commitments | ✅ Fases 1-6 done. Auditoría/dashboard parcial. | — |
| [`customer-portal.md`](./customer-portal.md) | Portal `/portal/*` para clientes WHOLESALE/CONSIGNMENT | ⏸ Fase 7 dividida en 7.A-D, sin empezar | `category-driven-pricing.md` (los precios del portal salen del nuevo flujo) |
| [`category-driven-pricing.md`](./category-driven-pricing.md) | Escalas por categoría, canal forzado en cotizaciones, llaveros con matriz | ✅ Fases 1-8 implementadas en `feature/category-tiers`. Pendiente QA manual + merge a develop. | — |
| [`edit-mode-and-feedback-system.md`](./edit-mode-and-feedback-system.md) | UX de formularios | ✅ Implementado | — |

## Matriz de superficies × cambios

Cada celda indica si la superficie cambia con el plan, y si necesita
intervención manual (testing visual / migración de datos / actualización
del componente).

| Superficie | `category-driven-pricing` | `customer-portal` (futuro) | Notas |
|---|---|---|---|
| `/productos/:id` — editor de producto | **Cambia mucho**: quita escalas + targetMarkupPct, categoría obligatoria | Sin impacto | Fase 3 del plan de categoría |
| `/productos/:id` — matriz de precios staff | **Cambia internamente**: lee de category tiers, layout igual | Sin impacto | Verificar visual: heredadas vs propias |
| `/cotizaciones/nueva-catalogo` | **Cambia mucho**: sin canal, checkbox "sin factura" | Sin impacto directo | Fase 5 del plan |
| `/cotizaciones/nueva-a-medida` | Mismo flip de canal/factura | Sin impacto | Fase 6 del plan |
| `/cotizaciones/nueva-llaveros` | Mismo flip + **nueva tabla comparativa** | Sin impacto | Fase 7 del plan |
| `/clientes/:id/precios/:productId` (price matrix) | **Cambia internamente**: tiers heredadas | Sin impacto | Riesgo de UI: tier "1-9" vs "5-9" cuando hay piso WHOLESALE — validar |
| `/clientes/:id` — commitments | Sin cambio funcional | Sin impacto | `minTierQty` sigue siendo válido contra category tiers |
| `/categorias/:id` | **Cambia mucho**: nuevo editor con tabs por canal + tiers | Sin impacto | Fase 4 del plan |
| `/parametros/llaveros` | Sin cambio | Sin impacto | Ya implementado |
| `/portal/catalogo` (futuro) | Lee del nuevo flujo (preview de matriz por categoría) | **Crea la pantalla** | Necesita category-driven-pricing en prod primero |
| `/portal/cotizaciones` (futuro) | Mismo motor | **Crea el flujo de pedidos** | Mismo bloqueo |
| PDF de cotización | Sin cambio en runtime (lee snapshot del `adhocPayload` / `QuoteItem`) | Sin cambio | El snapshot ya guarda `appliedMarkupPct`, `tierLabel`, etc. |

## Resolución de markup — fuente única de verdad (objetivo final)

```
customer.customMarkupPct                                     // SPECIAL only
  > tier.markupPct  ← CategoryPriceTier(qty, channel, customer.minTierQty)
  > category.priceTiers heredada del padre si subcategoría no tiene propias
  > category.baseMarkupPct                                   // fallback fuera de tier
```

Notas:
- **`tier.markupPct`** lo resuelve `CategoryTiersService.findApplicable(categoryId, channelId, qty)` con la cadena padre→subcategoría.
- **`customer.minTierQty`** sigue afectando QUÉ tier elige el motor (vía `mergeTiersBelowFloor` o el `Math.max(qty, minTier)` que ya existe), no la fuente.
- **`customer.customMarkupPct`** sigue siendo el override más fuerte; no se toca.
- **MELI** queda fuera del selector al cotizar, pero las tiers de categoría siguen existiendo para ese canal (lo usa el panel de productos).

## Call-sites a migrar (chequeo cuando arranque la fase 2)

Hoy `productPriceTier` o `tiers.findApplicable` aparecen en:

- [customer-pricing.service.ts:92](../apps/api/src/modules/customers/customer-pricing.service.ts#L92) — pricing por cliente
- [pricing.service.ts:82](../apps/api/src/modules/pricing/pricing.service.ts#L82) — matriz pública del producto
- [quotes.service.ts:535](../apps/api/src/modules/quotes/quotes.service.ts#L535) — `computeUnitPrice` resuelve la tier para una qty
- [product-tiers.service.ts](../apps/api/src/modules/products/product-tiers.service.ts) — CRUD completo, **se elimina entero**

Todos pasan a `CategoryTiersService`. Buena oportunidad para verificar que
ninguno se quedó leyendo del producto.

## Decisiones cross-cutting (críticas, alinear antes de codear)

1. ✅ **`Customer.defaultChannelId` se elimina del modelo.** Resuelto
   2026-05-16. El flujo simplificado (Venta Directa default + checkbox sin
   factura → Efectivo) hace que el campo pierda sentido tanto en staff como
   en portal. Drop column en la migración de Fase 1. **Impacto en el portal
   de cliente**: cuando se ejecute `customer-portal.md` Fase 7.B, las
   pantallas de precios derivan el canal del mismo checkbox que el staff,
   en lugar de leerlo del cliente.

2. **Portal del cliente y selector de canal**: con `defaultChannelId`
   eliminado, queda fijo: el portal usa el mismo flujo que el staff (oculta
   canal, ofrece checkbox sin factura). **Confirmado.**

3. **`baseMarkupPct` por categoría: ¿uno o por canal?** El plan dejó como
   default uno solo por categoría. Si en QA con MELI se ve que el canal
   necesita base distinto, agregar dimensión `channelId` al `baseMarkupPct`.
   **Decidir en fase 8 / QA, no antes.**

4. **Productos huérfanos**: la migración los manda a `'sin-clasificar'`.
   ¿El admin tiene que reclasificarlos sí o sí antes de cotizar, o se les
   deja un markup default y ya? Default propuesto: warning visible
   (`badge naranja en /productos`) + nada bloqueante. **Decidir si ese
   warning es suficiente o queremos bloquear cotizaciones de productos sin
   reclasificar.**

## Riesgo principal: cliente WHOLESALE con tier piso heredado

Caso: cliente WHOLESALE tiene `minTierQty = 5` en categoría "Lámparas".
"Lámparas de mesa" (subcategoría) no tiene tiers propios → hereda del padre.
El cliente ve la matriz fusionada `1-9 / 10-24 / 25+`
(`mergeTiersBelowFloor` con piso 5).

Verificar:
1. La tier heredada se merge correctamente (el algoritmo no asume "tiers
   directas del producto").
2. Si Lámparas (padre) tiene tier `1-4 / 5-9 / 10-24 / 25+`, la matriz para
   este cliente debe verse como `1-9 / 10-24 / 25+`.
3. Si Lámparas de mesa **agrega** sus propias tiers, descarta las del padre
   (regla todo-o-nada) — el cliente ve esas nuevas tiers con su piso aplicado
   sobre ellas.

**Esto es lo primero que voy a testear cuando lleguemos a Fase 2.**
Conviene tener un test unitario explícito para ese path antes de tocar la UI.

## Próximos pasos en orden

1. ✅ **Roadmap escrito** (este archivo) y plan detallado en
   `category-driven-pricing.md`.
2. ✅ **Pre-flight check**: `defaultChannelId` se elimina del modelo
   (decisión cross-cutting 1, resuelta 2026-05-16).
3. ✅ **Fase 1**: schema + migración. Branch `feature/category-tiers`,
   commit `b02906d`.
4. ✅ **Fase 2**: `CategoryTiersService` + 13 tests nuevos cubriendo
   herencia padre→hijo, fallback a `baseMarkupPct` y validación del set
   completo. Escenario WHOLESALE heredado verde. Commit `cd4edb6`.
5. ✅ **Fase 3 + 4**: UI producto sin markup + admin de categorías con
   tabs por canal y toggle "Heredar del padre". Commit `121c863`.
6. ✅ **Fase 5 + 6 + 7**: cotizaciones sin selector de canal, checkbox
   "Operación sin factura" (VD ↔ Efectivo), matriz comparativa de
   llaveros con endpoint `POST /quotes/keychain-matrix`. Commit `cc6fabe`.
7. ✅ **Fase 8**: refs residuales saneadas (incluido `produccion/[id]/page.tsx`
   que leía `product.targetMarkupPct`). Planes marcados como done.
8. ⬜ **QA manual** contra el branch antes de mergear a `develop`.
   Checklist completo en `category-driven-pricing.md` § Fase 8.
9. ⬜ **Cuando arranque `customer-portal.md` Fase 7**: releer este roadmap +
   decisión 2 antes de tocar precios en `/portal/*`.

## Cómo mantener este archivo vivo

Cada vez que se cierre una fase del plan referenciado:
1. Marcar la fase como done en su plan detallado.
2. Si cambió el alcance, actualizar la matriz de superficies o las
   decisiones cross-cutting acá.
3. Si surge una decisión cross-cutting nueva, agregarla a la sección
   "Decisiones cross-cutting" en lugar de enterrarla en el plan detallado.
4. Si se agrega un plan nuevo de pricing, sumarlo a la tabla "Planes vivos".
