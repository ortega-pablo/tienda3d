# Plan: Categorías para CONSIGNMENT + switch admin de markup/ganancia + fix PDF

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza para que el
> proceso sea retomable.

## Contexto

Hoy:

- **WHOLESALE** tiene categorías asociadas vía `CustomerCategoryCommitment`
  con `minTierQty`, `monthlyCommitmentQty`, `isWholesaleSuspended`. El
  `canBuy` y el catálogo filtran por estas filas. El detalle del cliente
  muestra el card `<CustomerCommitments>` solo cuando
  `customer.type === 'WHOLESALE'`.
- **CONSIGNMENT** no tiene filtro: `canBuy` devuelve `true` para todos los
  productos activos. El catálogo del cliente CONSIGNMENT lista todo el
  catálogo, sin posibilidad de habilitar/deshabilitar categorías.
- **Catálogo del cliente** (`/clientes/[id]/catalogo` + endpoint
  `/customers/:id/catalog.pdf`): muestra 4 columnas (Cantidad, Markup,
  Precio unit., Ganancia) en la web; el PDF tiene la tabla con
  layout roto (las columnas de "Markup" y "Ganancia" intencionalmente
  no se renderizan, pero el código de "Precio unitario" usa
  `text(..., continued: true)` con coordenadas erradas y los precios se
  superponen al título de la columna).

El negocio quiere:

1. Habilitar/deshabilitar categorías para clientes **CONSIGNMENT** (mismo
   UX que ya hay para WHOLESALE, sin los campos que solo aplican a
   mayoreo).
2. Un **switch admin** en el catálogo que muestre/oculte las columnas
   "Markup %" y "Ganancia / unidad". El cliente nunca debe ver esas
   columnas — el switch es solo para el staff que mira el catálogo
   desde el panel.
3. El **PDF respeta el switch** al momento de descargar — sirve para
   generar dos versiones (la limpia para mandar al cliente, la
   detallada para uso interno).
4. **Fix del PDF**: la tabla actual no se renderiza correctamente.

## Decisiones cerradas (2026-05-22)

1. **CONSIGNMENT sin categorías asignadas → no ve nada.** Estricto.
   Obliga al admin a configurar antes de que el cliente pueda comprar.
   Implementación: `canBuy` para CONSIGNMENT devuelve `false` si el
   cliente no tiene commitments para la categoría (o padre).
2. **Reusar `CustomerCategoryCommitment`** para ambos tipos. Los campos
   wholesale-only (`minTierQty`, `monthlyCommitmentQty`,
   `isWholesaleSuspended`) son nullable; para CONSIGNMENT quedan en
   `null` / `false`. Cero migración de schema.
3. **El cliente nunca ve markup ni ganancia.** El switch es exclusivo
   del staff en `/clientes/[id]/catalogo`. Default = OFF (modo "como ve
   el cliente"). El PDF descargado respeta el switch — el staff elige
   en el momento si descarga la versión para cliente (OFF) o la
   detallada (ON).

## Modelo conceptual

```
CustomerCategoryCommitment {
  customerId
  categoryId
  minTierQty           Int?    // solo WHOLESALE — null para CONSIGNMENT
  monthlyCommitmentQty Int?    // solo WHOLESALE
  isWholesaleSuspended Bool    // solo WHOLESALE — para CONSIGNMENT siempre false
  ...
}
```

Una **row del lado de CONSIGNMENT representa "esta categoría está
habilitada para este cliente"**. La ausencia de row = categoría
deshabilitada. Lo mismo que ya pasa con WHOLESALE.

## Resolución de `canBuy` (después del cambio)

```
WHOLESALE / CONSIGNMENT → producto.categoryId ∈ commitments del cliente
                            (o el padre del categoryId del producto)
STANDARD                 → true (no se persiste, walk-in)
SPECIAL                  → producto.id ∈ customer.productOverrides
```

## Fases

### Fase 1 — Backend: CONSIGNMENT participa de commitments

- [ ] `customers.service.ts` `canBuy`:
  - [ ] Mover CONSIGNMENT al mismo branch que WHOLESALE — chequea
    `customer.categoryCommitments`.
- [ ] `customers.service.ts` `getCatalog` / `forCustomer` filter:
  - [ ] Aplica el mismo filtro de categorías para CONSIGNMENT.
- [ ] Validación en `CustomersWriteService` cuando se modifican
  commitments: aceptar CONSIGNMENT donde antes solo aceptaba WHOLESALE.
- [ ] Para inputs de CONSIGNMENT, ignorar `minTierQty` /
  `monthlyCommitmentQty` / `isWholesaleSuspended` (siempre persistir
  `null` / `false`). El front no envía esos campos para CONSIGNMENT.
- [ ] Tests:
  - [ ] CONSIGNMENT con 0 commitments + producto X → `canBuy = false`.
  - [ ] CONSIGNMENT con commitment categoría X + producto en X →
    `canBuy = true`.
  - [ ] CONSIGNMENT con commitment categoría padre + producto en
    subcategoría → `canBuy = true` (herencia, igual que WHOLESALE).
  - [ ] WHOLESALE sigue funcionando idéntico (regression).

### Fase 2 — Backend: switch admin del catálogo + PDF

- [ ] El endpoint `GET /customers/:id/catalog` ya devuelve todos los
  campos (markup, profit). El front controla la visibilidad — sin
  cambio backend.
- [ ] El endpoint `GET /customers/:id/catalog.pdf` acepta query param
  `?showMargins=true|false` (default `false`):
  - [ ] `false` → renderiza columnas `Cantidad | Precio unitario` (lo
    que ve el cliente).
  - [ ] `true` → renderiza columnas `Cantidad | Markup % | Precio
    unitario | Ganancia / unidad` (vista interna).
- [ ] **Fix del layout del PDF** (`customer-catalog-pdf.service.ts`
  `renderProductCard`):
  - [ ] Reemplazar la mezcla de `text(..., continued: true)` por
    posicionamiento absoluto por columna con coordenadas X fijas (igual
    al patrón de `pdf.service.ts` de cotizaciones — ese sí funciona).
  - [ ] Anchos de columna: definir constantes en cabecera del archivo
    (ej. `COL_QTY_X = 48; COL_MARKUP_X = 200; COL_PRICE_X = 320; COL_PROFIT_X = 460`).
  - [ ] Header de tabla con `fillColor` distinto y borde inferior.
  - [ ] Cada fila: usar `doc.text(value, x, y, { width, align })` —
    nada de `continued`.
  - [ ] Manejo de salto de página: chequear `doc.y` antes de cada fila
    y llamar `addPage()` si es necesario.

### Fase 3 — Frontend: gestionar categorías de CONSIGNMENT

- [ ] `customer-commitments.tsx` (existente, solo WHOLESALE):
  - [ ] Renombrar visualmente para CONSIGNMENT: "Categorías habilitadas"
    en lugar de "Compromisos".
  - [ ] Cuando `customer.type === 'CONSIGNMENT'`, ocultar columnas
    `minTierQty`, `monthlyCommitmentQty`, badge de suspensión.
  - [ ] Solo mostrar: checkbox/switch de categoría + (opcional) notas.
- [ ] `clientes/[id]/page.tsx`:
  - [ ] Quitar el gate `customer.type === 'WHOLESALE' &&` del card de
    commitments — mostrarlo también cuando es CONSIGNMENT.
  - [ ] Para CONSIGNMENT, el card también muestra el aviso si está vacío:
    "Sin categorías habilitadas — este cliente no ve productos hasta
    que asignes al menos una categoría".

### Fase 4 — Frontend: switch del catálogo + descarga

- [ ] `clientes/[id]/catalogo/page.tsx`:
  - [ ] Pasar a client component (o anidar uno) para manejar el state
    del switch.
  - [ ] Switch en el header del catálogo, después del nombre del
    cliente: "Mostrar markup y ganancia (vista admin)" con
    `<Switch defaultChecked={false}>`.
  - [ ] El estado controla la visibilidad de columnas en `ProductRow`.
  - [ ] El botón "Descargar PDF" se convierte en un link dinámico:
    `?showMargins=${switchOn}`.
  - [ ] Aviso bajo el switch cuando ON: "Esta vista incluye margen
    interno — el PDF descargado NO se debe entregar al cliente".
- [ ] El switch NO persiste (solo en la sesión, igual que el de la
  matriz de keychain). Si en algún momento se pide persistencia, se
  agrega después.

### Fase 5 — Cleanup y QA manual

- [ ] Verificar que clientes CONSIGNMENT existentes (si los hay en la
  base local) no rompan — su `canBuy` ahora devuelve `false` si no
  tienen commitments. Comunicar al admin: revisar todos los clientes
  CONSIGNMENT en `/clientes` y configurarles categorías.
- [ ] QA:
  - [ ] Crear cliente CONSIGNMENT, verificar que `canBuy` falla para
    cualquier producto.
  - [ ] Asignarle categoría X, verificar que sí puede comprar productos
    de X y de subcategorías de X.
  - [ ] Quitarle la categoría, verificar que vuelve a no poder comprar.
  - [ ] Catálogo `/clientes/:id/catalogo` con switch OFF → no se ven
    columnas markup/ganancia. PDF descargado tampoco las tiene.
  - [ ] Switch ON → se ven en la web. PDF descargado las incluye.
  - [ ] PDF: las columnas se alinean correctamente (sin
    superposiciones), salto de página funciona, columnas extra (con
    switch ON) entran en el ancho A4 sin recortes.
  - [ ] WHOLESALE no se ve afectado: sus commitments siguen aceptando
    `minTierQty` y `monthlyCommitmentQty`.

## Riesgos y consideraciones

1. **Clientes CONSIGNMENT existentes pierden el catálogo**: el cambio a
   `canBuy` los deja sin productos hasta que un admin les asigne
   categorías. **Mitigación**:
   - Aviso en `/clientes` si existen CONSIGNMENT sin commitments (badge
     naranja "Sin categorías configuradas").
   - Aviso en el detalle del cliente reforzando el setup.
   - Si en la base local hay datos productivos críticos, el admin debe
     configurar las categorías ANTES del deploy.

2. **El switch del catálogo en producción**: hay riesgo operativo de
   que un admin descargue el PDF con `showMargins=true` y se lo mande
   al cliente sin querer. **Mitigación**: aviso visible cuando el switch
   está ON ("Esta vista incluye margen interno — NO entregar al
   cliente"). Considerar agregar el aviso también dentro del PDF mismo
   (footer en rojo) — se evalúa en Fase 4.

3. **PDF fix**: el rewrite del layout es la pieza más riesgosa
   visualmente. Validación: descargar con datos de prueba ANTES de
   cerrar la fase. Comparar con el PDF de cotizaciones
   (`pdf.service.ts`) que sí está bien para tomar el patrón.

4. **Compatibilidad con futuro portal del cliente**: cuando se haga
   `customer-portal.md` Fase 7, el portal NUNCA debe mostrar markup /
   ganancia al cliente. El backend ya no las omite — el front del
   portal tendrá que filtrar. Anotado para esa fase.

## Cambios concretos por archivo

### Backend

| Archivo | Cambio |
|---|---|
| `customers.service.ts` | `canBuy` mueve CONSIGNMENT al branch de filtro por commitments. |
| `customers.service.ts` | `getCatalog` / `forCustomer` filter aplica para CONSIGNMENT. |
| `customers.service.ts` (WriteService) | Aceptar CONSIGNMENT en el writer de commitments; ignorar campos wholesale-only. |
| `customers.controller.ts` | `GET /customers/:id/catalog.pdf` acepta `?showMargins=true`. |
| `customer-catalog-pdf.service.ts` | Rewrite de `renderProductCard` con posicionamiento absoluto por columna. Recibe `showMargins` y renderiza condicionalmente. |

### Frontend

| Archivo | Cambio |
|---|---|
| `clientes/[id]/page.tsx` | Quitar gate `type === 'WHOLESALE'` del card de commitments. |
| `clientes/[id]/customer-commitments.tsx` | Renderizado condicional por tipo: WHOLESALE muestra todos los campos; CONSIGNMENT solo categoría + notas. |
| `clientes/[id]/catalogo/page.tsx` | Pasar a client component / componente anidado, agregar Switch, link PDF dinámico. |
| `components/ui/switch.tsx` | Verificar que existe (es un componente shadcn estándar). Si no, agregar con `pnpm dlx shadcn add switch`. |

## Decisiones pendientes (no bloqueantes para arrancar)

- ¿Agregar un sello "VISTA INTERNA — NO ENTREGAR AL CLIENTE" en el
  footer del PDF cuando `showMargins=true`? Recomendado: sí, como
  red de seguridad. Decidir en Fase 4.
- ¿El `/audit` log debería capturar las descargas de PDF con
  `showMargins=true` (auditoría de quién vio los márgenes y cuándo)?
  Recomendado: sí. Decidir en Fase 2.

## Fuera de alcance (otro plan)

- **Portal del cliente** (`customer-portal.md` Fase 7): cuando llegue,
  hereda esta lógica — el portal nunca pasa `showMargins=true` ni
  consulta los campos. Esa pantalla la podrá ver el cliente sin riesgo
  porque la decisión de qué se le muestra vive del lado del servidor.
- **Auto-asignar categorías al crear cliente CONSIGNMENT**: sería un
  template ("CONSIGNMENT default: todas las categorías"). Se puede
  agregar más adelante si surge la necesidad operativa.
