# Plan: Portal de clientes (Fase 7)

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza.
> Continúa el plan principal en
> [customer-types-and-pricing.md](./customer-types-and-pricing.md).

## Contexto

Fases 0-6 completas. El staff puede gestionar clientes, cotizar a su nombre,
y enviarles un PDF con el catálogo. La Fase 7 cierra el ciclo: cada cliente
con `hasPortalAccess = true` puede entrar a `/portal`, ver su catálogo
personalizado, generar pedidos, ver el estado de sus compromisos mensuales y
gestionar su perfil.

Es la fase más grande del plan. Se subdivide en **4 sub-fases** entregables
por separado:

| Sub-fase | Alcance | Valor inmediato |
|---|---|---|
| **7.A** | Auth + onboarding + layout + perfil | Cliente puede loguearse y ver/editar sus datos. |
| **7.B** | Catálogo + compromisos | Cliente ve su catálogo y avance del mes. |
| **7.C** | Carrito + pedidos + mis pedidos | Cliente arma pedidos online (Quote SENT). |
| **7.D** | Notificaciones por email | Onboarding por email + alertas de pedidos/cambios. |

Cada sub-fase es entregable. Recomendamos releases incrementales
(7.A solo, después 7.B, etc.).

## Decisiones acordadas (heredadas)

- 1 cliente = 1 usuario portal (1:1 con `User.customerId`).
- Pedido del portal → `Quote` con `status = SENT` directo + notificación al staff.
- Canal del portal: `customer.defaultChannelId`. Si null, el portal pide
  elegir o falla con mensaje claro.
- El cliente NO ve costos ni profit. Solo precio final.
- Las cotizaciones del portal son visibles para el cliente solo si están
  vinculadas a su `customerId`.

## Glosario

- **Portal user**: `User` con `customerId` poblado y rol `customer-portal`
  (creado en Fase 1, ya existe en DB).
- **Staff user**: `User` sin `customerId`, con cualquier rol distinto de
  `customer-portal`.
- **`@CustomerOnly`**: guard que rechaza staff y exige `currentCustomer`
  poblado en el request.
- **Token de primera contraseña**: token de un solo uso válido 7 días que
  recibe el cliente por email para establecer su password inicial.
- **Token de reset**: token de un solo uso válido 1h para "olvidé contraseña".

---

## Sub-fase 7.A — Auth, onboarding, layout y perfil

> **Objetivo**: el cliente puede loguearse, establecer su contraseña, ver
> sus datos y cambiar su password. Sin catálogo todavía.
> **Entregable**: portal navegable solo con perfil.

### 7.A.1 — Schema mínimo para tokens

- [ ] Tabla `PortalAccessToken`:

```prisma
model PortalAccessToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Hash del token (bcrypt o sha256). El token plano vive solo en el email.
  tokenHash String   @unique
  /// Tipo: 'WELCOME' (primera password, 7d) | 'RESET' (1h)
  type      PortalAccessTokenType
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId, type])
  @@map("portal_access_tokens")
}

enum PortalAccessTokenType {
  WELCOME
  RESET
}
```

- [ ] Migración nueva con la tabla + enum + permisos:
  - El rol `customer-portal` ya existe (Fase 1) con sus 3 permisos.
  - Verificar que existan; si no, agregar idempotente.

### 7.A.2 — Backend: módulo `portal/`

- [ ] Estructura `apps/api/src/modules/portal/`:
  - `portal.module.ts` (importa AuthModule, CustomersModule)
  - `portal-auth.service.ts`:
    - `requestWelcomeToken(customerId, actor)` — staff dispara el envío.
      Crea User si no existe (con email del Customer + rol customer-portal),
      genera token WELCOME, lo guarda hasheado, devuelve token plano para
      que el caller lo mande por email.
    - `requestResetToken(email)` — endpoint público. Si existe un User
      con ese email y rol customer-portal, genera token RESET. No revela
      si el email existe o no.
    - `consumeToken(tokenPlain, type)` — valida, marca usedAt, devuelve
      userId.
    - `setPassword(userId, password)` — hashea con argon2 y guarda.
  - `portal-profile.service.ts`:
    - `getMyProfile(currentUser)` — devuelve datos del Customer (sin flags,
      sin commitments — solo lo que el cliente puede ver).
    - `updateContact(currentUser, { email, phone })` — solo email/phone
      editables. Cambio de email requiere confirmación adicional (queda
      como tarea opcional para 7.D si se simplifica).
    - `changePassword(currentUser, oldPw, newPw)` — verifica oldPw, hashea
      nuevo.
  - `portal.controller.ts`:
    - `POST /portal/auth/login` (público) — usa AuthService existente,
      pero rechaza si el User no tiene customerId.
    - `POST /portal/auth/request-reset` (público).
    - `POST /portal/auth/reset/:token` (público).
    - `POST /portal/auth/welcome/:token` (público).
    - `GET /portal/profile` (CustomerOnly).
    - `PATCH /portal/profile` (CustomerOnly).
    - `POST /portal/profile/password` (CustomerOnly).

### 7.A.3 — Guard `@CustomerOnly` + middleware de routing

- [ ] `apps/api/src/common/guards/customer-only.guard.ts`:
  - Verifica que `req.user.customerId` esté poblado.
  - Inyecta `req.currentCustomer` resolviendo el Customer por id.
  - Rechaza con 403 si es staff (sin customerId).
- [ ] Frontend middleware `apps/web/src/middleware.ts`:
  - User con `customerId` que entra a `/(protected)/...` → redirect `/portal`.
  - Staff (sin `customerId`) que entra a `/portal/...` → redirect `/`.
  - User sin sesión que entra a `/portal/...` → redirect `/portal/login`.

### 7.A.4 — Layout y branding

- [ ] `apps/web/src/app/portal/layout.tsx`:
  - Header simple: logo + nombre del negocio + nombre del cliente +
    botón salir.
  - Navbar horizontal: Catálogo · Mis pedidos · Compromisos · Perfil.
    (Los items que no son de 7.A se renderizan grayed-out hasta que su
    sub-fase llegue).
  - Sin sidebar.
- [ ] `apps/web/src/app/portal/login/page.tsx`:
  - Form email + password.
  - Link "Olvidé mi contraseña".
- [ ] `apps/web/src/app/portal/recuperar-password/page.tsx`.
- [ ] `apps/web/src/app/portal/establecer-password/[token]/page.tsx`
  (sirve tanto para WELCOME como RESET — el backend distingue por tipo).

### 7.A.5 — UI: Perfil

- [ ] `apps/web/src/app/portal/perfil/page.tsx`:
  - Datos del cliente (read-only: nombre, tipo, taxId).
  - Editables: email, teléfono.
  - Sección "Cambiar contraseña" con form actual / nueva / confirmar.
  - Lista de **categorías asociadas** (read-only) — para que el cliente
    sepa qué puede comprar cuando llegue 7.B.
- [ ] `apps/web/src/components/portal-shell.tsx` o equivalente: provider
  con `currentCustomer` cargado del backend.

### 7.A.6 — UI staff: crear cuenta de portal desde el detalle

- [ ] En `clientes/[id]/page.tsx` (o nuevo componente
  `customer-portal-section.tsx`):
  - Si `customer.hasPortalAccess === false`: botón "Crear cuenta de portal"
    → confirma → llama a `POST /customers/:id/portal-account` que
    delega a `portal-auth.requestWelcomeToken`.
  - Si `customer.hasPortalAccess === true`: badge verde + botón "Resetear
    contraseña" + botón "Bloquear acceso" (setea `User.isActive = false`).
- [ ] Endpoint nuevo `POST /customers/:id/portal-account` que el staff
  llama. Devuelve un mensaje "Email enviado". El email mismo se envía en
  7.D (por ahora puede loguear el token plano a la consola para testing).

### 7.A.7 — Tests

- [ ] `portal-auth.service.spec.ts`: token genera/valida/expira.
- [ ] Smoke manual:
  - Staff crea cuenta de portal → recibe token (en logs).
  - Cliente abre `/portal/establecer-password/<token>` → setea password.
  - Cliente loguea en `/portal/login`.
  - Staff que entra a `/portal/...` es redirigido a `/`.
  - Cliente que entra a `/(protected)/dashboard` es redirigido a `/portal`.

### 7.A.8 — Verificación final

- [ ] `pnpm typecheck` API + Web limpios.
- [ ] Tests verdes.
- [ ] Smoke real: flujo completo de onboarding desde el detalle de un
  Customer.

---

## Sub-fase 7.B — Catálogo + compromisos en el portal

> **Objetivo**: el cliente ve sus productos con precios y el avance de
> sus compromisos del mes.
> **Entregable**: portal con vistas read-only del catálogo y volúmenes,
> pero sin posibilidad de generar pedidos todavía.
> **Pre-req**: 7.A entregada.

### 7.B.1 — Backend: lectura de catálogo del portal

- [ ] `portal-catalog.service.ts`:
  - `forCurrentCustomer(currentCustomer)` — reusa la lógica de
    `CustomerCatalogService.forCustomer(currentCustomer.id)`.
  - **Filtra** los campos sensibles antes de devolver: profit, cost
    breakdown, todo lo que no debe ver el cliente. Solo deja: nombre,
    SKU, descripción, categoría, imageUrl, channelName, tiers (con
    minQty/maxQty/markupPct/finalPrice), basePrice.
- [ ] Endpoint `GET /portal/catalog` (CustomerOnly).
- [ ] Endpoint `GET /portal/catalog/:productId` para detalle (mismo
  filtrado, sirve para la vista detallada de un producto).
- [ ] **Decisión**: el portal **muestra** el markup% para que el cliente
  entienda por qué cambia el precio según la cantidad, **pero no muestra
  ganancia ni costo**. Si querés ocultar también el markup, lo borramos
  acá antes de devolver.

### 7.B.2 — Backend: lectura de compromisos del mes

- [ ] `portal-commitments.service.ts`:
  - `getMonthlyProgress(currentCustomer)` — devuelve por cada
    CategoryCommitment con `monthlyCommitmentQty != null`:
    - `categoryName`, `monthlyCommitmentQty`, `unitsSold` (del mes en
      curso), `daysRemaining`, `isWholesaleSuspended`, `suspendedAt`.
  - Reusa la lógica del cron pero solo del mes en curso.
- [ ] Endpoint `GET /portal/commitments` (CustomerOnly).
- [ ] Si el cliente no es WHOLESALE o no tiene commitments con
  compromiso, devolver array vacío. La UI no muestra el item del nav.

### 7.B.3 — UI: Catálogo

- [ ] `apps/web/src/app/portal/catalogo/page.tsx`:
  - Listado de productos filtrados por categoría asociada al cliente.
  - **Filtros**: chips de categorías (auto-derivados del set de productos
    visibles) + input de búsqueda por nombre.
  - **Card de producto**:
    - Imagen (si tiene) o placeholder.
    - Nombre + descripción corta.
    - Precio destacado (`basePrice` o tier 1).
    - Si hay tiers, expansible "ver escalas" con tabla.
  - Sin botón "agregar al pedido" todavía (eso es 7.C).
- [ ] `apps/web/src/app/portal/catalogo/[productId]/page.tsx`:
  - Detalle del producto con escalas completas.
  - Banner contextual si la categoría está suspendida: "Esta categoría
    no tiene mayoreo activo actualmente. Los precios se muestran al
    valor público."

### 7.B.4 — UI: Compromisos

- [ ] `apps/web/src/app/portal/compromisos/page.tsx`:
  - Reusa el componente `CustomerMonthProgress` de Fase 5 (extraer si
    hace falta) o crear `PortalMonthProgress` con datos del nuevo
    endpoint.
  - Cards por categoría con barra de progreso color-coded, días
    restantes, X/Y unidades, alerta si está atrasado o suspendido.
- [ ] Item "Compromisos" en el nav del portal aparece solo si el
  cliente tiene al menos 1 commitment con compromiso.

### 7.B.5 — Tests + verificación

- [ ] Smoke con cliente real:
  - Login portal → ver catálogo filtrado.
  - Verificar que profit/cost NO aparecen en el JSON ni en el HTML.
  - Verificar que productos de otras categorías NO aparecen.
  - Verificar progress del mes en curso.

---

## Sub-fase 7.C — Carrito + pedidos online + mis pedidos

> **Objetivo**: el cliente arma un pedido y lo envía. Aparece como Quote
> SENT en el panel staff.
> **Entregable**: el ciclo de venta online queda cerrado para el cliente.
> Falta solo email automático (Sub-fase 7.D).
> **Pre-req**: 7.B entregada.

### 7.C.1 — Frontend: carrito en localStorage

- [ ] `apps/web/src/components/portal-cart.tsx` o hook `usePortalCart()`:
  - Estado: `items: { productId, quantity }[]`, persiste en localStorage
    con key `tienda3d:portal-cart:<customerId>` (por si el cliente tiene
    cuenta personal y profesional en el mismo browser).
  - Acciones: add, removeItem, updateQty, clear.
  - Header del portal muestra contador del carrito como badge.

### 7.C.2 — Frontend: flujo de pedido

- [ ] En la card/detalle del catálogo (Sub-fase 7.B): botón "Agregar al
  pedido" con selector de cantidad.
- [ ] `apps/web/src/app/portal/pedido/page.tsx`:
  - Resumen del carrito: items con cantidad editable, eliminar, recálculo
    en vivo de precios al cambiar qty (consulta `/portal/preview`).
  - Notas para el staff (textarea opcional).
  - Botón "Enviar pedido".
- [ ] `apps/web/src/app/portal/pedido/confirmacion/page.tsx`:
  - Pantalla post-envío: "Pedido Q-2026-0042 enviado, recibirás
    confirmación pronto".

### 7.C.3 — Backend: creación de pedidos del portal

- [ ] `portal-orders.service.ts`:
  - `previewItem(currentCustomer, productId, qty)` — reusa
    `quotes.previewItem` con `customerId = currentCustomer.id` y filtra
    profit/cost del response.
  - `createOrder(currentCustomer, { items, notes })` — valida cada item
    con `customers.canBuy`, valida que `defaultChannelId` esté seteado
    (sino devuelve 400 con mensaje "Tu canal no está configurado,
    contactá al staff"), llama a `quotes.create` con `customerId =
    currentCustomer.id`. Devuelve el quote completo con código.
- [ ] Endpoints (CustomerOnly):
  - `POST /portal/preview` — { productId, quantity } → { unitPrice,
    lineTotal } (sin profit/cost).
  - `POST /portal/orders` — body { items, notes? } → quote creada.

### 7.C.4 — UI: Mis pedidos

- [ ] `apps/web/src/app/portal/pedidos/page.tsx`:
  - Lista de cotizaciones del cliente, ordenadas por fecha desc.
  - Cada row: código, fecha, estado, total. Click → detalle.
- [ ] `apps/web/src/app/portal/pedidos/[id]/page.tsx`:
  - Detalle del pedido con items + precios snapshot.
  - History de transiciones (DRAFT → SENT → ACCEPTED…).
  - Si está en SENT y todavía no fue aceptado: botón "Cancelar pedido"
    (PATCH a DRAFT). Notifica al staff.
- [ ] Endpoint `GET /portal/orders` y `GET /portal/orders/:id`
  (CustomerOnly, filtra por `customerId === currentCustomer.id`).
- [ ] Endpoint `PATCH /portal/orders/:id/cancel` (CustomerOnly, solo
  si status = SENT).

### 7.C.5 — Validaciones de seguridad (cross-cutting)

- [ ] El cliente del portal **NUNCA** puede acceder a quotes de otros
  clientes — verificar en cada endpoint con `quote.customerId !==
  currentCustomer.id` → 403.
- [ ] Throttler estricto en `/api/portal/*` (ej. 30 req/min) para evitar
  scraping/abuse.
- [ ] Cada pedido creado desde el portal queda en `AuditLog` con
  `actorId` del User customer-portal.

### 7.C.6 — UI staff: alerta de pedidos pendientes

- [ ] Dashboard del staff: nuevo widget "Pedidos del portal pendientes"
  que cuenta quotes SENT con `customerId != null` creadas en las
  últimas 24h.
- [ ] (Opcional) Filtro en `/cotizaciones` para ver solo pedidos del
  portal.

### 7.C.7 — Smoke y verificación

- [ ] Cliente de prueba arma pedido de 3 items, los envía.
- [ ] Staff ve la quote SENT en `/cotizaciones` con badge "Portal".
- [ ] Cliente ve el pedido en `/portal/pedidos`.
- [ ] Cliente cancela → pasa a DRAFT, aparece en su histórico como
  cancelado, staff lo ve también.

---

## Sub-fase 7.D — Notificaciones por email

> **Objetivo**: completar el ciclo asíncrono. El cliente recibe emails
> automáticos al onboarding, reset, pedido enviado/aceptado/rechazado.
> El staff recibe email de cada nuevo pedido.
> **Entregable**: portal "production-ready" para usuarios externos.
> **Pre-req**: 7.A, 7.B, 7.C entregadas.

### 7.D.1 — Provider y configuración

- [ ] **Decisión sobre provider**: opciones razonables:
  - **Resend** — el más simple, tiene SDK Node, free tier generoso.
  - **SendGrid** — más establecido, también free tier.
  - **SMTP genérico** (Gmail/SES) — máxima flexibilidad, más config.

  Recomendación: empezar con **Resend** (less friction). Si en el futuro
  el volumen crece, migramos.

- [ ] Variables de entorno:
  - `EMAIL_PROVIDER` (resend / sendgrid / smtp)
  - `EMAIL_FROM` (ej. "Plastik 3D <noreply@tienda.com>")
  - `EMAIL_API_KEY` (Resend/SendGrid)
  - O las SMTP equivalentes si aplica.
- [ ] `apps/api/.env.example` con los nuevos campos documentados.

### 7.D.2 — Servicio `email.service.ts`

- [ ] `apps/api/src/modules/notifications/`:
  - `email.module.ts` (global).
  - `email.service.ts` con un único método público
    `send({ to, subject, template, data })`.
  - Templates como funciones que reciben `data` y devuelven HTML +
    plain text. Ubicación: `apps/api/src/modules/notifications/templates/`.
  - **Failure mode**: el envío de email **NUNCA** bloquea la operación
    principal. Falla → log con warning + audit log con la falla.

### 7.D.3 — Templates mínimos

- [ ] `welcome.tsx` (o `.ts`): bienvenida con link de primera contraseña.
  Variables: `customerName`, `welcomeUrl`, `expiresIn` (7d).
- [ ] `reset-password.ts`: con link de reset (1h).
- [ ] `order-sent-customer.ts`: confirmación al cliente (Q-2026-XXXX,
  resumen items, total).
- [ ] `order-received-staff.ts`: aviso al staff de pedido nuevo + link al
  detalle interno.
- [ ] `order-accepted.ts` / `order-rejected.ts`: cliente recibe el cambio
  de estado.
- [ ] (Opcional) `commitment-reminder.ts`: si quedan pocos días en el
  mes y el cliente está lejos de su compromiso.

### 7.D.4 — Wire-up

- [ ] `portal-auth.service`: al crear cuenta o pedir reset, dispara el
  email correspondiente.
- [ ] `portal-orders.service.createOrder`: dispara email al cliente
  + email al staff (a una lista de emails internos definida en config).
- [ ] `quotes.service.setStatus`: cuando una quote del portal pasa a
  ACCEPTED/REJECTED, dispara el email correspondiente al cliente.
- [ ] (Opcional) `customer-cron.service`: dispara reminder a clientes
  con menos del 50 % del compromiso a 7 días del cierre.

### 7.D.5 — Tests + verificación

- [ ] Tests unit del servicio: cada template renderiza sin error con
  datos válidos.
- [ ] Smoke en dev:
  - Creo cuenta de portal → llega email de bienvenida (con Resend en
    sandbox / mailtrap / inbox real).
  - Cliente envía pedido → staff recibe + cliente recibe confirmación.
  - Staff acepta pedido → cliente recibe email.

### 7.D.6 — Adicional: gestión de bloqueo / suspensión

- [ ] Cuando el cron auto-suspende una categoría del cliente: opcional
  email al cliente avisando ("este mes no llegaste al compromiso, el
  mayoreo de Lámparas queda suspendido hasta que el admin lo reactive").
  Decisión del usuario si activarlo.

---

## Roadmap de releases sugerido

| Release | Sub-fases | Días estimados (referencial) |
|---|---|---|
| v0.7-portal-alpha | 7.A | 4-5 |
| v0.7-portal-beta | 7.A + 7.B | +3-4 |
| v0.7-portal-rc | 7.A + 7.B + 7.C | +5-6 |
| **v0.7-portal-prod** | 7.A + 7.B + 7.C + 7.D | +2-3 |

(Días estimados son orientativos.)

## Riesgos y abiertos

| Riesgo / abierto | Mitigación |
|---|---|
| Cliente del portal cambia su email — pierde acceso si olvida el nuevo. | Recovery email de 24h o requerir confirmación al viejo email antes de aplicar. Pendiente de decisión. |
| Provider de email cae → el flujo de bienvenida queda incompleto. | El backend siempre devuelve el token plano por logs en dev; en prod, el staff puede regenerar el token desde el detalle del cliente. |
| Pedido del portal con `defaultChannelId` no seteado. | El portal devuelve 400 con mensaje claro ("Tu canal no está configurado, contactá al staff"). UI bloquea el botón "Enviar". |
| Cliente del portal con todas las categorías suspendidas. | Sigue viendo catálogo al precio público. UI le advierte. |
| Carrito perdido al cerrar sesión. | localStorage por (browser, customerId). Persistencia inter-dispositivo fuera de alcance MVP — agregar tabla `Cart` si se demanda. |
| 1 cliente = 1 usuario, pero clientes con varios compradores comparten credenciales. | Decisión actual aceptada. Si en el futuro hace falta, agregar tabla `CustomerUser` (1 customer → N users). |
| Staff envía link de bienvenida pero el email del cliente está mal. | Endpoint para regenerar token. Token viejo queda invalidado. |
| Throttler global ya configurado (120/min). El portal podría requerir más estricto. | Ajustar `@Throttle()` específico en el portal controller. |

## Convenciones

- Todas las rutas del portal viven en `/portal/...` (frontend) y
  `/api/portal/...` (backend).
- El portal **nunca** lee endpoints de staff (`/api/customers/...`,
  `/api/products/...`) directamente. Si necesita los mismos datos,
  hay un endpoint específico del portal que filtra los campos
  sensibles.
- Tokens (welcome/reset) usan SHA-256 del valor plano. El plano se
  envía por email, el hash queda en DB.
- Emails siempre con `actorId` del sistema o del staff que disparó la
  acción, en el `AuditLog` para trazabilidad.
- `apps/web/src/app/portal/layout.tsx` usa un `CustomerPortalProvider`
  distinto al `UserProvider` actual (carga `currentCustomer` además del
  user).

---

## Estado actual

- [ ] Sub-fase 7.A — Auth + onboarding + layout + perfil
- [ ] Sub-fase 7.B — Catálogo + compromisos
- [ ] Sub-fase 7.C — Carrito + pedidos + mis pedidos
- [ ] Sub-fase 7.D — Notificaciones por email

Cuando las cuatro estén tildadas, este archivo se puede archivar y el
plan principal queda completo.
