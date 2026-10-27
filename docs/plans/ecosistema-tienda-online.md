# Plan: Ecosistema Tienda Plastik — sistema de gestión + tienda online

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza. Cada fase tiene su bloque
> **Verificación**: no se pasa a la siguiente hasta que esté en verde. Al cerrar una fase, sumar
> una línea a la **Bitácora** (§9).
>
> **Última actualización:** 2026-10-26 · **Alcance:** `tienda3d/` (este repo),
> `tienda-plastik-page/storefront/` y un repo nuevo de infraestructura (D1).

---

## Índice

0. [Convenciones](#0-convenciones)
1. [Objetivo y resultado final](#1-objetivo-y-resultado-final)
2. [Decisiones tomadas](#2-decisiones-tomadas)
3. [Decisiones abiertas](#3-decisiones-abiertas)
4. [Relevamiento](#4-relevamiento)
5. [Arquitectura objetivo](#5-arquitectura-objetivo)
6. [Fases](#6-fases)
7. [Riesgos](#7-riesgos)
8. [Fuera de alcance](#8-fuera-de-alcance)
9. [Bitácora](#9-bitácora)

---

## 0. Convenciones

| Ítem | Convención |
| --- | --- |
| IDs | `F<fase>·<n>` (por ejemplo `F5·3`). No se reutilizan: una tarea descartada se tacha con su motivo. |
| Repos | **[t3d]** = `tienda3d` · **[sf]** = `tienda-plastik-page` (código en `storefront/`) · **[infra]** = repo nuevo `tienda-plastik-infra` (D1). |
| Rutas | Relativas a la raíz de cada repo. En [sf], relativas a `storefront/`. |
| Ramas | `feat/eco-f<fase>-<slug>` desde la rama base de cada repo (en [t3d], después de F0·1). |
| Commits | Estilo de cada repo: [t3d] `feat(scope): …`; [sf] mensaje en español. Incluir el ID: `Cierra F5·3.` |
| Verificación mínima | [t3d] `pnpm typecheck && pnpm test && pnpm test:int` · [sf] `pnpm typecheck && pnpm lint && pnpm test` (+ `pnpm test:e2e` donde se indique). |
| Verificación automática | **Sin GitHub Actions.** Corre en hooks locales con lefthook: `pre-commit` (gitleaks sobre lo que se commitea + formato y lint de los archivos tocados) y `pre-push` (typecheck + tests unitarios). `pnpm verify` corre todo, integración incluida, y es obligatorio antes de mergear un PR. |
| Estimaciones | Rangos en horas **propuestos**, incluyen definir cómo se hace. Confirmarlos o corregirlos antes de arrancar cada fase. |
| Base de datos | Nunca resetear una base con datos sin preguntar. Cambios de esquema siempre por migración. |

---

## 1. Objetivo y resultado final

**Resultado final:** un **sistema de gestión** (tienda3d) que suma la gestión del ecommerce, y un
**sitio web** (storefront) que muestra los productos y recibe los pedidos.

**Objetivo de infraestructura:** todo corriendo con Docker en **una EC2** y, a largo plazo, la base
en **RDS**. **Antes de evaluar el despliegue**, el ecosistema completo tiene que funcionar y
probarse en local (fases F0–F16). F17–F20 se encaran solo si el resultado de F16 es "sí".

**Cuándo está listo para evaluar el despliegue (fin de F16):**

- El admin de tienda3d publica, edita y oculta productos web desde el sistema, y el sitio lo refleja
  en segundos.
- El sitio lee el catálogo con un usuario de base que **solo** puede leer vistas de lo publicado.
- Un cliente se registra, verifica su email, compra y consulta sus compras en "Mi cuenta".
- Cada pedido queda guardado en el sitio y registrado en el sistema, donde el admin lo gestiona; el
  cliente ve los cambios de estado y recibe los mails.
- No hay secretos en el código, en las imágenes ni en variables de entorno; todo se puede rotar.
- El backup y la restauración de todo el ecosistema están probados.

---

## 2. Decisiones tomadas

Definidas por Pablo el 2026-10-26.

| ID | Decisión | Consecuencia en el plan |
| --- | --- | --- |
| T1 | El panel del ecommerce vive en tienda3d y es para el rol **`admin` existente**. No se crean roles ni usuarios nuevos. | Permisos `ecommerce:*` solo para `admin` (F4). |
| T2 | Toda la información de productos sale de **una sola base: la de tienda3d**. | El storefront deja de tener catálogo propio (F12). |
| T3 | El sitio lee el catálogo con un **usuario de solo lectura** limitado a lo que necesita. | Esquema `storefront_v1` con vistas + rol `storefront_reader` (F10). |
| T4 | El sitio **guarda los datos de cada compra** en su base y **notifica al sistema**, que registra los pedidos que entran por la tienda. | El storefront conserva una base propia (clientes y pedidos) con escritura solo ahí; integración por API (F11, F14). |
| T5 | El **precio publicado** es el **precio de Venta Directa a cliente normal**. | Proyección automática del precio (F7). Sin precios cargados a mano. |
| T6 | Para comprar hay que **crear una cuenta o iniciar sesión** como cliente normal. Sin cuenta no se compra. La cuenta guarda todas las compras. | Cuentas de cliente en el storefront (F13). |
| T7 | Un **producto web** puede agrupar **más de un producto del sistema** para indicar sus variantes. | Modelo "publicación" con miembros (F5). |
| T8 | Los **colores** de cada producto web se eligen de los colores de filamento que existen en el sistema **para el filamento que usa**: la web puede mostrar 2 aunque se pueda imprimir en 5. | Opción de color por línea de filamento con subconjunto elegido (F5·3). |
| T9 | Las **imágenes** se guardan en un **volumen Docker**, también en producción. | Almacenamiento en disco con puerto intercambiable (F6). |
| T10 | Destino: **EC2 con Docker**; a largo plazo **RDS**. Primero, probar todo en local. | F3 replica la topología de producción en local; F17–F18 son evaluación. |
| T11 | **Mercado Pago** se conecta más adelante. Los secretos tienen que seguir **los mejores estándares**, con herramientas **gratuitas**. | F1 y §5.8; MP queda en F19. |

**Interpretación de T6, a confirmar en D4:** "usuario de cliente normal" es una **cuenta de cliente
del sitio**, no un usuario del sistema de gestión. Así no se incorporan usuarios a tienda3d (T1), y
el sistema registra a cada comprador como **cliente web** a partir de sus pedidos.

---

## 3. Decisiones abiertas

Cada una tiene una **propuesta** con la que el plan está escrito. Si se elige otra opción, corregir
las tareas que se nombran.

| ID | Pregunta | Propuesta | Si se elige otra | Bloquea |
| --- | --- | --- | --- | --- |
| D1 | ¿Dónde vive la orquestación del ecosistema (compose conjunto, Caddy, scripts de secretos y de despliegue)? | Repo nuevo **`tienda-plastik-infra`** en la carpeta madre. Los dos repos de apps siguen siendo independientes. | Carpeta `deploy/` dentro de tienda3d: cambian las rutas de F3 y F17. | F3 |
| D2 | ¿El sitio registra el pedido en el sistema en el momento o en diferido? | **En el momento** (llamada a la API con idempotencia), porque el sistema valida precio y reserva stock; los cambios siguientes viajan como **eventos con reintento**. Si el sistema no responde, el sitio no toma el pedido y lo dice. | Diferido (outbox): el pedido nunca se pierde, pero puede venderse stock que no hay. | F14·3 |
| D3 | ¿La web aplica las escalas de Venta Directa por cantidad (comprar 10 sale más barato por unidad)? | **No**: precio unitario de cantidad 1 para cualquier cantidad. Es el precio publicado y no sorprende al cliente. | Sí: la vista expone las escalas y el carrito recalcula por cantidad. | F7, F12, F14 |
| D4 | ¿Cómo registra el sistema a los compradores web? | Tabla propia **`web_customers`** (copia mínima que manda el sitio), separada de los clientes B2B (`customers`). | Crear `Customer` tipo `STANDARD`: mezcla compradores web con mayoristas y consignación. | F14·2 |
| D5 | ¿Hay que verificar el email antes de poder comprar? | **Sí** (link de un uso, 24 h). Evita pedidos con emails falsos y asegura que lleguen los avisos. | No: se verifica después y se marca en el pedido. | F13 |
| D6 | ¿Se permiten **atributos informativos** sin producto del sistema detrás (por ejemplo "Tipo de hoja: Cuadro/Punto")? | **Sí**, sin impacto en el precio: hoy los usan 6 cuadernos. | No: cada valor tiene que ser un producto del sistema distinto (habría que crear 6 productos más en tienda3d). | F5·4, F9 |
| D7 | ¿Cómo se paga hasta que esté Mercado Pago? | **Transferencia** con confirmación manual del admin en el panel. En local, además, el pago **simulado**. | Solo "coordinar por WhatsApp" (pedido sin pago en el sitio). | F14·4 |
| D8 | En EC2, ¿el panel de gestión queda abierto a internet? | Con una **capa extra gratuita**: Cloudflare Access o Tailscale. Se decide en F17. | Solo el login de tienda3d con su bloqueo por intentos. | F17 |
| D9 | ¿Cómo se maneja el stock de la tienda? | Por variante: **a pedido** (con plazo y máximo por pedido) o **stock de producto terminado** cargado a mano. La orden de producción se genera a mano desde el pedido. | Conectar producción terminada con stock automáticamente (fuera de alcance, §8). | F5·5 |
| D10 | ¿Quién manda los mails? | **Solo el storefront** (ya tiene mailer y plantillas). tienda3d no necesita SMTP. Proveedor productivo (SES, Brevo, SMTP del dominio) se elige en F17. | tienda3d también manda (por ejemplo, avisos internos): hay que sumarle un mailer. | F13, F14 |
| D11 | ¿EC2 ARM (Graviton) o x86? | Se decide en F16 con las mediciones. ARM es más barato; `argon2` y `sharp` tienen binarios para arm64, pero hay que construir las imágenes para esa arquitectura. | — | F17 |
| D12 | Conciliación del catálogo actual con la dueña (§4.8). | Armar el pedido de confirmación con las 4 diferencias y los colores. | — | F9 |

---

## 4. Relevamiento

Relevamiento del 2026-10-26 sobre el código de los dos repos y la base local en uso de tienda3d.

### 4.1 Mapa actual

| | tienda3d (sistema de gestión) | storefront (sitio web) |
| --- | --- | --- |
| Repo | `ortega-pablo/tienda3d` (privado) | `ortega-pablo/tienda-plastik-page` (privado), código en `storefront/` |
| Stack | Next.js 16.0.0 + React 19 (web) · NestJS 11 + Prisma 6.19.3 + Zod (API) · PostgreSQL 16 · monorepo pnpm (`apps/api`, `apps/web`, `packages/shared`) | Next.js 16.4.3 (App Router, Cache Components, Server Actions) · Prisma 7 + PostgreSQL 16 · Tailwind v4 |
| Corre | Docker Compose local en el taller: web `:3000`, API `:3001`, Postgres `:5432` | Docker Compose: tienda `:3100`, Postgres `:5442`, Mailpit `:8026` |
| Rama | `fix/auditoria-correcciones`: 1 commit adelante de su remoto, 69 sobre `main` (que tiene 8 commits; la base real es `develop`). Rename sin commitear de `docs/FUNCIONALIDADES.md` → `docs/funcionalidades-sistema-gestion.md`. | `main` = `origin/main` (756f467), limpio. Tag `wordpress-final` con el WordPress. |
| Tests | ~121 unitarios (12 archivos) · ~20 de integración contra Postgres real (5 archivos) · sin e2e · **sin CI** | 61 unitarios (Vitest) · 18 e2e (Playwright, escritorio + celular) · sin CI |
| Producción | No tiene: corre en la PC del taller | No tiene: el sitio público sigue siendo el WordPress en Hostinger |

### 4.2 tienda3d — plataforma

**Arranque** (`apps/api/src/main.ts`):

- Helmet sin CSP, `compression`, `cookieParser`, límite JSON y urlencoded de `1mb`.
- CORS por `CORS_ORIGIN` con `credentials: true`; prefijo global `api`; `trust proxy` 1.
- Guard global `JwtAuthGuard` (`@Public` lo saltea).
- Rate limit con `@nestjs/throttler` v6 en memoria, por IP: 120/60 s por defecto, login 10/min, refresh 30/min (`app.module.ts:44-47`, `auth.controller.ts:40,53`).
- `GET /api/health` público, con `SELECT 1`, uptime y versión.

**Configuración:**

- `ConfigModule.forRoot` **sin esquema de validación**. En Docker las variables vienen del `environment:` del compose, interpolado desde el `.env` de la raíz.
- `assertSecrets` (`common/config/validate-secrets.ts`) solo revisa `JWT_SECRET` y `REFRESH_SECRET`: que no falten, que no sean de ejemplo, que tengan ≥32 caracteres y que no sean iguales. En producción corta el arranque; en el resto avisa.
- **No revisa** la clave de la base ni `SEED_ADMIN_PASSWORD`.
- Variables que lee la API: `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `JWT_SECRET`, `JWT_EXPIRES_IN` (15m), `REFRESH_SECRET`, `REFRESH_EXPIRES_IN` (7d), `DATABASE_URL`, `BRAND_LOGO_PATH`, `INTEGRATION_{MELI,ARCA,WHATSAPP}_ENABLED` y sus credenciales, y `SEED_ADMIN_{EMAIL,PASSWORD}`.
- La web lee solo `API_INTERNAL_URL` (por defecto `http://api:3001`).

**Auth:**

- Cookies `plastik_access` / `plastik_refresh`: `httpOnly` y `SameSite=Lax`. `Secure` **solo si `NODE_ENV=production`**.
- Access JWT HS256 de 15 min con `permissions[]` en el payload, sin consulta a la base por request: un cambio de rol tarda hasta 15 min en aplicarse.
- Refresh de 7 días, rotado; se guarda su hash SHA-256 en `refresh_tokens`.
- Bloqueo de cuenta: 8 intentos fallidos → 15 min. Contraseñas con `argon2` y parámetros por defecto.
- La web hace de proxy de todo `/api/*` hacia la API (`apps/web/src/app/api/[...path]/route.ts`): limpia `x-forwarded-*` y pasa el cuerpo crudo (`arrayBuffer`), así que **soporta multipart**.

**RBAC:**

- 29 permisos en `apps/api/prisma/seed.ts:15-57`, más 3 `portal:*`.
- `admin` recibe **todo** el array `PERMISSIONS` (`seed.ts:128`). `operator` recibe todo menos una lista. `viewer` recibe **todas las claves `:read`**: un `ecommerce:read` nuevo le llegaría al viewer si no se excluye.
- El seed **no corre solo**: los permisos nuevos llegan a una base existente por **INSERT en una migración** (patrón ya usado en `20260508000000_categories` y `20260508010000_customers`).
- `PermissionsGuard` exige **todas** las claves de `@Permissions(...)` y se aplica por controller.
- El test `common/security/route-permissions.spec.ts` recorre los controllers y exige tres cosas: permiso en toda ruta no pública, ninguna escritura protegida solo con `:read`, y toda clave declarada en `seed.ts`.
- En la web, `nav.ts` muestra un ítem si el usuario tiene **alguno** de sus permisos.

**Datos y operación:**

- La API se conecta con el **superusuario/dueño** de Postgres (`POSTGRES_USER`). No hay `CREATE ROLE` ni `GRANT` en ningún lado.
- `prisma migrate deploy` corre en el CMD del contenedor de la API, antes de arrancar.
- Hay 29 migraciones; algunas solo SQL, como el índice único parcial de `20260821030000_one_current_price_per_material`.
- Backup: `POST /api/admin/backup` (`parameter:write`) hace `pg_dump` y lo descarga; `scripts/backup-db.sh` guarda en iCloud y conserva 30. No hay endpoint de restauración.

**Lo que no hay** (impacta este plan):

- Subida de archivos: `Product.imageUrl` y `Material.imageUrl` son un texto URL que **ninguna pantalla muestra**.
- Mailer.
- Webhooks entrantes, API keys, HMAC y cliente HTTP saliente. Las integraciones MELI/ARCA/WhatsApp son stubs.
- Cola de trabajos: hay `@nestjs/schedule`, con un único cron mensual (`customers/customer-cron.service.ts:65`).
- Request id y CI.

**Docker:**

- API en `node:20-alpine` con `tini`, `postgresql16-client` y usuario `nestjs` (uid 1001); copia todo `node_modules`, incluidas las devDependencies.
- Web en Next standalone, usuario `nextjs` (1001). **Su imagen de producción no compila (F-30)**.
- El compose publica `5432`, `3001` y `3000` en **todas las interfaces**. Red `tienda3d_net`, volumen `db_data`, sin `secrets:`.

**Logs y errores:**

- `nestjs-pino`, que redacta `authorization` y `cookie`.
- Contrato de errores `{code, message, details?, path, timestamp}`, con códigos de `packages/shared/src/errors.ts`.

### 4.3 tienda3d — catálogo y precios

**Producto** (`apps/api/src/modules/products/`):

- SKU `PTK-PROD-NNNNNN` de la secuencia `product_sku_seq`, inmutable. El comentario `-V01` de `products.service.ts:414` **no está implementado**: no hay variantes. Cada tamaño es un producto distinto con su SKU y su precio.
- `kind`: STANDARD o KEYCHAIN, inmutable. Los llaveros tienen piezas `INDIVIDUAL` y `BATCH`.
- Las piezas tienen `defaultFilamentId`. El editor solo ofrece filamentos padre, y en la práctica todas apuntan a una **línea** de filamento; el color se elige al fabricar.
- Endpoints: `GET /products`, `GET/PUT/DELETE /products/:id`, `GET /products/:id/{cost,prices,keychain-costs}`, `POST /products`. Los schemas zod están **dentro del controller**, no en `packages/shared`.

**Problemas del PUT de producto** (afectan la publicación web):

- `isActive: input.isActive ?? true` (`products.service.ts:295`): **omitir el campo reactiva un producto archivado**.
- Si `channels` viene vacío, `resolveChannels` **vuelve a habilitar Venta Directa** y Efectivo (`:373-387`).
- La respuesta devuelve `notes` aunque el usuario no tenga `parameter:write` (`:348`).
- **Borra y recrea las piezas en cada guardado** (`:304-317`), así que los IDs de pieza cambian. Hoy nada puede referenciar una pieza de forma estable.

**Precio de Venta Directa a cliente normal, cantidad 1** (T5):

- La entrada es `PricingService.forProduct(productId)` (`pricing/pricing.service.ts:71`), la misma que usa el panel de precios del editor (`GET /products/:id/prices`).
- Hay que tomar el bloque `channelSlug === 'directa'`: `base.finalPrice` si no hay escalas, o el `finalPrice` del tier con `minQty = 1`. Para KEYCHAIN, `forKeychainProduct` (`:191`) devuelve tiers: se toma la banda 1–4.
- Fórmula (`pricing.engine.ts:59-86`): `finalPrice = ceil50( (fab × (1 + markup%) + otrosInsumos) / (1 − comisión% − régimen%) × IVA )`, donde `fab` es (filamento + máquina + mano de obra + marketing/unidades) × (1 + contingencia% + reinversión%).
- Valores hoy en la base: comisión de venta directa `6.5`, régimen `4`, `iva_pct` `21`. El IVA **no se aplica**, porque Directa es `SIMPLE` sin `appliesIva`. Redondeo `price_rounding_step = 50`, que es **siempre hacia arriba** (`pricing/round-price.ts`).
- El markup sale de `CategoryPriceTier` (categoría × canal), con herencia del padre, y si no hay escalas, de `baseMarkupPct`. Cliente normal = `customerId = null` → perfil vacío: sin descuentos ni markup propio.

**Ambigüedades del precio, resueltas en F7:**

- Si un producto **no tiene markup en ningún nivel**, `forProduct` no devuelve precio (`base = null`), mientras que las cotizaciones caen a markup 0. La web usa `forProduct` y **no publica sin precio**.
- `forProduct` no devuelve el bloque de Directa si el canal está deshabilitado para el producto; las cotizaciones lo ignoran. La web exige Directa habilitada.
- Un `Customer` persistido de tipo STANDARD puede tener flags o markup propio. El precio web es siempre el de `customerId = null`.

**Escrituras que cambian el precio de un producto** (disparan el recálculo de F7·2):

- `PUT`/`DELETE /products/:id`.
- `PATCH /materials/:id` (desperdicio, reposición, unidad) y los precios de insumo: `POST /materials/:id/prices` con `setCurrent`, `PATCH …/prices/:priceId/current` y `DELETE …/prices/:priceId`.
- `PATCH /parameters`.
- Máquinas: `POST`/`PATCH /machines/:id`, `PATCH …/activate`, `DELETE`.
- `PATCH /categories/:id` y `PUT /categories/:id/tiers` (con cascada a hijas).
- `PATCH /channels/:id` y `PATCH /keychain-scale-tiers/:id`.
- Volver a correr el seed (pisa los canales).

**Filamentos y colores** (`materials/materials.service.ts:122-145`):

- Jerarquía de un nivel. El **padre** (línea, por ejemplo "PLA Genérico") tiene precio, densidad y desperdicio. Los **hijos** tienen `color` (obligatorio), `colorHex` (opcional) y stock.
- No hay endpoint de hijos: `GET /materials?type=FILAMENT&activeOnly=true` devuelve los padres con `children` anidados.
- **Bug:** `activeOnly` usa `z.coerce.boolean`, así que `"false"` se lee como `true` (también en categorías).
- Orden de producción: `filamentOverrides: Record<pieceId, childMaterialId>`. Es obligatorio y se valida (hijo activo de la línea) solo si el filamento de la pieza tiene hijos (`productions.service.ts:113-155`).
- **Bug:** en llaveros, el consumo y el costo de producción suman piezas INDIVIDUAL + BATCH (`:234-254`).

**Categorías:**

- Dos niveles, con `slug` único y editable, `icon` de texto y `sortOrder`; `baseMarkupPct` se hereda.
- **Definen el markup**, así que no sirven como categorías de vidriera: reordenar la web cambiaría precios.

### 4.4 tienda3d — ventas, producción, stock y clientes

**Cotizaciones:**

- `DRAFT → SENT → ACCEPTED`, con `REJECTED`/`EXPIRED` → `DRAFT`. Los cambios de estado usan `updateMany` con guarda dentro de `$transaction`; si pierde la carrera, 409.
- Códigos por `DocumentCodeService` (`common/utils/document-code.ts`): `PREFIJO-AAAA-NNNN` con `INSERT … ON CONFLICT`. El año sale del reloj del servidor, no de la hora de Argentina.
- Ninguna tarea vence las cotizaciones automáticamente.

**Producción:**

- `PLANNED → IN_PROGRESS → DONE/CANCELLED`. Al terminar descuenta insumos en una transacción (el stock puede quedar negativo, por decisión).
- **No hay vínculo** entre cotización u orden y orden de producción.

**Stock:**

- **No existe stock de producto terminado** en ningún lado: solo de insumos.
- Se usan solo los movimientos `OUT` y `ADJUSTMENT`.
- **Bugs:** el ajuste manual guarda `Math.abs(delta)` (pierde el signo), y `PATCH /materials/:id` acepta `currentStock` sin registrar un movimiento.

**Clientes:**

- Tipos `STANDARD/WHOLESALE/CONSIGNMENT/SPECIAL`, con flags de precio. `STANDARD` "no se usa en MVP".
- **Portal B2B** (`docs/plans/customer-portal.md`, 7.A–7.D): **no empezado**. Existen el rol `customer-portal`, los permisos `portal:*` y `User.customerId`; faltan tokens, guard, endpoints, mail y UI.

**Planes previos:**

- `correcciones-auditoria-2026-08.md`: 24/25 cerrados. Siguen abiertos **F-30** (la imagen de producción de la web no compila) y **F-23** (rotar `POSTGRES_PASSWORD` y `SEED_ADMIN_PASSWORD`).
- El resto de los planes está implementado, aunque varios tienen las casillas sin tildar.

### 4.5 tienda3d — panel web (patrones a seguir)

**Estructura:**

- `app/(protected)/layout.tsx` llama a `requireUser()` y monta `AppShell`.
- Sidebar en `components/nav.ts` (`NavItem {label, href, icon, permissions?}`), filtrado en `app-shell.tsx:16-24`.
- `proxy.ts` refresca el token de forma proactiva solo en `PROTECTED_PREFIX`, una lista fija a la que le faltan `/clientes`, `/categorias` y `/reportes`.

**Datos:**

- Las páginas de servidor llaman a `requirePermission(...)` y luego hacen `Promise.all` de `api<T>()` (`lib/api-server.ts`).
- Las mutaciones van por `lib/api-client.ts`, que **siempre manda JSON**: para subir archivos hace falta un `fetch` con `FormData`.
- No hay React Query ni Server Actions. Después de mutar se usa `router.refresh()`.

**Formularios:**

- `useState` + `buildPayload` + `isFormValid`. react-hook-form solo aparece en login y alta de usuario.
- Edición con `hooks/use-edit-mode.ts`, con botones "Editar", "Cancelar" y "Guardar".

**Componentes UI disponibles:**

- `button`, `card`, `input`, `label`, `checkbox`, `spinner`, `confirm-dialog`, `status-badge`.
- **Faltan** Dialog, Tabs, Switch, Select y Textarea: hoy se usan elementos nativos y overlays propios.

**Editor de producto:**

- `productos/[id]/page.tsx` renderiza `<ProductEditor>` (tarjetas apiladas, `fieldset` deshabilitado fuera de edición, panel de costo fijo a la derecha) y `<ProductPrices>`.
- El guardado es un **PUT completo**. La sección web va como **componente aparte con guardado propio** (patrón de `clientes/[id]/page.tsx:73-86`), para no acoplarla al PUT del costeo.

**Otros:**

- Colores: `/materials` devuelve los padres con `children` (`color`, `colorHex`). Para los swatches, copiar el patrón de `insumos/materials-view.tsx:426-430`.
- `packages/shared` sigue la convención `fooSchema` + `type FooDto = z.infer<…>`. Muchos DTOs están **redeclarados a mano** en la web, y los módulos nuevos tienen que usar shared.
- La web no tiene tests. Copy en español rioplatense con voseo; archivos en kebab-case.

### 4.6 tienda3d — datos reales (base local en uso, 2026-10-26)

| Dato | Valor |
| --- | --- |
| Migraciones aplicadas | hasta `20260821030000_one_current_price_per_material` |
| Productos | 38, todos activos, **todos con piezas de "PLA Genérico"** |
| Líneas de filamento | 2: "PLA Genérico", "ABS genérico" |
| **Colores de filamento** | **1**: "PLA Genérico · Blanco" `#FFFFFF` |
| Insumos | 3 FILAMENT · 9 HARDWARE · 4 OTHER · 2 SHEET · 1 PACKAGING (todos con stock 0) |
| Cotizaciones / órdenes de producción | 10 / 0 |
| Usuarios | 2 (1 `admin`, 1 `operator`) · Clientes B2B: 6 |
| Canales | `directa` DIRECT_SALE · `mercadolibre` MARKETPLACE · `efectivo` CASH, todos `SIMPLE` sin IVA |
| Venta Directa deshabilitada | en 0 productos |

En la raíz del repo hay un volcado `tienda3d_dump_2026-07-22.sql`. Está ignorado por git y nunca se
commiteó, pero **contiene usuarios, tokens de refresco y clientes** (F0·2).

### 4.7 storefront — estado actual

**Qué hace hoy:**

- Clon del sitio con las mismas URLs que WordPress.
- Catálogo propio con variantes y stock, carrito en cookie (`tp_cart`), checkout como invitado y pagos (puerto con proveedor simulado y Mercado Pago Checkout Pro, listo pero sin credenciales).
- Pedidos, cotizaciones a medida con adjunto, mails con Nodemailer, y panel `/admin` con sesión propia.

| Pieza | Destino en el plan |
| --- | --- |
| Páginas públicas, diseño, `src/content/`, SEO, carrito en cookie, `domain/cart.ts`, `domain/money.ts`, `domain/rich-text.ts`, `domain/checkout.ts`, `domain/shipping.ts` | **Se quedan.** |
| `domain/catalog.ts` (ProductView, disponibilidad, selección de variantes) | **Se queda**, alimentado por las vistas del sistema (F12·1). |
| `domain/variants.ts` (`planVariants`) | **Se porta a tienda3d** (F5·5). |
| `domain/orders.ts` (estados y transiciones) | **Se divide**: pago en el sitio, preparación en el sistema (§5.6). |
| Modelos Prisma de catálogo (`Category`, `Product*`, `Variant*`), `StoreSettings`, seed de catálogo, `scripts/import-woocommerce.ts` | **Se van** (F12·5). `prisma/seed/catalog.json` + `media/` alimentan la migración (F9). |
| Panel `/admin`, `AdminUser`, `AdminSession`, `server/actions/admin/*`, `server/admin/*` | **Se van** (F12·5); se rehacen en tienda3d (F8, F14·5, F15). |
| `Order`, `OrderItem`, `Payment`, `PaymentNotification`, `OrderEvent`, `QuoteRequest` | **Se quedan y cambian** (F14, F15). |
| `server/payments/*` (gateway, MP, simulado, reglas y firma de webhook) | **Se queda**; MP se activa en F19. |
| `server/mail/*` | **Se queda y crece** (cuentas y estados). |
| `server/storage.ts` + `/media/[...path]` | **Se queda**, lee el volumen del sistema en solo lectura (F12·3). |
| `server/rate-limit.ts` (en memoria) | **Se queda** (una sola instancia). |

**Variables actuales** (`src/server/env.ts`): `NODE_ENV`, `DATABASE_URL`, `SITE_URL`,
`UPLOADS_DIR`, `PAYMENTS_PROVIDER`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`,
`MP_STATEMENT_DESCRIPTOR`, `SMTP_URL`, `MAIL_FROM`, más `ADMIN_EMAIL`/`ADMIN_PASSWORD` del seed.

### 4.8 Correspondencia de catálogos (web hoy ↔ sistema)

| Producto web | Opciones web | SKU web | Producto(s) del sistema | Estado |
| --- | --- | --- | --- | --- |
| Cuaderno Plastik A5 – Army | Tipo de hoja | PTK-PROD-000026 | Cuaderno A5 — Army | ok |
| Cuaderno Plastik A5 – DEV | Tipo de hoja | PTK-PROD-000019 | Cuaderno A5 — DEV | ok |
| Cuaderno Plastik A5 – Edición Arirang | Color (Blanco, Negro) × Tipo de hoja | PTK-PROD-000017 | Cuaderno A5 — Arirang BTS | ok |
| Cuaderno Plastik A5 – Monocromático | Tipo de hoja × Color (7) | **TPK**-PROD-000001 | PTK-PROD-000001 Cuaderno A5 — Monocromático | **error de tipeo en la web** |
| Cuaderno Plastik A5 – Noche / Día | Tipo de hoja | TPK-PROD-27 | — | **no existe en el sistema** (PTK-PROD-000027 es el Cuaderno A4) |
| Cuaderno Plastik A5 – Riso | Tipo de hoja | PTK-PROD-27 | — | **no existe en el sistema** |
| Lámpara Lana — Mesa | Color (Negro) | PTK-PROD-000006 | Lana | ok |
| Lámpara Lia — Colgante | Color (Blanco, Negro) | PTK-PROD-000025 | Lámpara Lia — Colgante | ok |
| Lámpara Lina — Mesa | Color (4) | PTK-PROD-000005 | Lina | ok |
| Lámpara Mila — Colgante | Color (3) | PTK-PROD-000009 | Mila | ok |
| Lámpara Nala — Colgante | Color (3) | PTK-PROD-000010 | Nala | ok |
| Lámpara Trapecio — Mesa | Color (4) × Tamaño (280, **380**) | PTK-PROD-000003, -000004 | Trapecio 280, Trapecio **390** | **380 vs 390** |
| Lámpara Vera — Mesa | Color (5) | PTK-PROD-000002 | Vera R | ok |

Totales web: 13 productos, 52 variantes y 64 fotos. **11 colores** con su código:

- Blanco `#ffffff` · Negro `#000000` · Perla `#f0ede8`
- Marrón `#a16958` · Vainilla `#c9b8a4` · Beige `#f9bd72`
- Verde Militar `#8a8e63` · Verde Manzana `#92b275` · Verde Oliva `#baaa5b`
- Gris carbón `#424447` · Frutilla `#f0529c`

En el sistema solo existe Blanco. Hay 25 productos del sistema que no están en la web (Tina, Clásica,
cuadernos con logo, llaveros, mates, cajas, etc.): el admin decide cuáles publicar.

**Los precios van a cambiar al aplicar T5:** los de la web hoy no son múltiplos de 50 (por ejemplo
$ 39.995,78 y $ 47.643,01 en la Trapecio). F9·3 arma el reporte de diferencias para la dueña.

### 4.9 Secretos y seguridad — hallazgos

| # | Hallazgo | Severidad | Se resuelve en |
| --- | --- | --- | --- |
| S1 | Escaneo del **historial completo** con gitleaks: no hay secretos propios en ningún repo. En [t3d] hay 2 falsos positivos (datos de prueba en `apps/api/src/common/config/validate-secrets.spec.ts`). En [sf], los únicos hallazgos están en código de plugins de WordPress de terceros (commit `a23354bc`, hoy solo en el historial y en el tag `wordpress-final`). | Info | F1·4 (allowlist) |
| S2 | `.env` local de [t3d] con `POSTGRES_PASSWORD` igual al valor de ejemplo y `SEED_ADMIN_PASSWORD=admin123` (F-23 parcial). | Alta | F1·5 |
| S3 | `API_NODE_ENV` local no es `production`, así que las cookies del sistema salen sin `Secure`. | Media (local) | F3·6, F17 |
| S4 | Volcado de la base con usuarios, tokens y clientes en la raíz del repo de [t3d]. | Media | F0·2 |
| S5 | Los secretos se pasan como **variables de entorno** en los dos sistemas: aparecen en `docker inspect` y en el entorno de cualquier proceso hijo (por ejemplo, el `pg_dump` del backup). | Media | F1·1, F3·6 |
| S6 | La API de [t3d] usa el **superusuario** de Postgres, y su endpoint de backup descarga la base completa, con hashes de contraseñas. | Alta | F2·6, F3·2 |
| S7 | El compose de [t3d] publica Postgres, API y web en todas las interfaces. Con `trust proxy 1`, un `X-Forwarded-For` falso esquiva el límite por IP si se le pega directo a la API. | Alta al exponerse | F3·4 |
| S8 | No hay escaneo de secretos ni CI en ningún repo. | Media | F1·4, F2·7 |
| S9 | [sf] valida pagos simulados solo con `localhost` y exige `MP_WEBHOOK_SECRET` fuera de localhost; no lee secretos desde archivo. | Info | F1·1 |
| S10 | Los permisos van en el JWT y no se revalidan por request (ventana de 15 min). | Baja | aceptado |

### 4.10 Deuda de tienda3d que afecta este plan

| ID | Problema | Por qué importa acá | Tarea |
| --- | --- | --- | --- |
| F-30 | La imagen de producción de la web no compila. | No se puede probar el ecosistema como en producción ni desplegarlo. | F2·1 |
| P1 | El PUT de producto reactiva archivados, rehabilita Venta Directa y filtra notas. | La web publicaría productos archivados y precios de un canal que se quiso apagar. | F2·2 |
| P2 | El PUT recrea las piezas, que cambian de ID. | Los colores se asignan a piezas (T8) y la orden de producción usa IDs de pieza. | F2·3 |
| P3 | `activeOnly=false` se lee como `true`. | El selector de colores podría mostrar colores inactivos. | F2·4 |
| P4 | Doble consumo en la producción de llaveros. | Generar una orden desde un pedido de llaveros descontaría el doble. | F2·5 |
| P5 | API con superusuario y migraciones en el CMD de la API. | Impide el modelo de roles de §5.3. | F2·6, F3·2 |
| P6 | Sin CI ni request id. | No se puede seguir un pedido entre los dos sistemas. | F2·7, F2·8 |

---

## 5. Arquitectura objetivo

### 5.1 Diagrama

```
             local: tienda.localhost · sistema.localhost · correo.localhost
             EC2:   tiendaplastik.com · sistema.tiendaplastik.com (HTTPS)
                                   │
                           ┌───────▼────────┐
                           │     Caddy      │  TLS, cabeceras, x-request-id,
                           │ (único público)│  404 a /api/internal/* y /api/integrations/*
                           └───┬────────┬───┘
                               │        │
                  ┌────────────▼──┐  ┌──▼──────────────┐
                  │  storefront   │  │  tienda3d-web   │  proxy /api/* → tienda3d-api
                  │  (Next.js)    │  │  (Next.js)      │
                  └──┬───┬─────▲──┘  └──────┬──────────┘
   API de servicio   │   │     │ eventos    │
   (registra pedido) │   │     │ firmados   │
                  ┌──▼───┴─────┴────────────▼──┐
                  │        tienda3d-api        │──── volumen media (rw)
                  │        (NestJS)            │──── volumen privado t3d (adjuntos)
                  └──────────────┬─────────────┘
                                 │ tienda3d_app
  storefront_app  ┌──────────────▼────────────────────────────────┐
  ───────────────►│ PostgreSQL 16 (contenedor hoy → RDS mañana)   │
                  │  base tienda3d:   public (sistema)            │
  storefront_     │                   storefront_v1 (vistas) ◄────┼── storefront_reader
  reader ────────►│  base storefront: clientes, pedidos, pagos    │
                  └───────────────────────────────────────────────┘
  storefront-worker (misma imagen que storefront): outbox, mails, limpieza
  volumen media: tienda3d-api escribe · storefront y su worker leen (ro)
```

### 5.2 Dueño de cada dato

| Dato | Escribe (dueño) | Lee | Por dónde |
| --- | --- | --- | --- |
| Productos, recetas, costos, precios por canal | tienda3d | — | — |
| Publicaciones web, variantes, colores, atributos, fotos, categorías web, ajustes de la tienda | tienda3d (admin) | storefront | vistas `storefront_v1` |
| Precio publicado (Venta Directa, cliente normal, cantidad 1) | tienda3d (cálculo automático) | storefront | vista |
| Stock de venta web | tienda3d | storefront | vista + reserva por API al registrar el pedido |
| Cuentas de cliente, sesiones, direcciones | storefront | tienda3d (copia mínima: cliente web) | evento `customer.upserted` |
| Pedido (datos de la compra) | storefront | tienda3d (registro) | API `POST …/orders` |
| Estado de **pago** | storefront (MP en F19; transferencia confirmada por el admin vía evento) | tienda3d | eventos |
| Estado de **preparación / entrega** | tienda3d | storefront | eventos |
| Solicitudes de personalización | storefront (recibe) → tienda3d (gestiona) | — | outbox con adjunto |
| Mails al cliente y aviso de pedido a la tienda | storefront | — | SMTP |

### 5.3 Bases y roles

Una instancia de PostgreSQL con **dos bases**, igual que tendrá RDS. Ningún servicio usa el
superusuario.

| Rol | Base | Puede | Lo usa |
| --- | --- | --- | --- |
| `postgres` (superusuario; *master* en RDS) | todas | todo | solo el init y el mantenimiento |
| `tienda3d_owner` | tienda3d | dueño de `public` y `storefront_v1`; DDL | servicio `tienda3d-migrate` |
| `tienda3d_app` | tienda3d | SELECT/INSERT/UPDATE/DELETE en `public`, uso de secuencias, sin DDL | `tienda3d-api` |
| `storefront_reader` | tienda3d | `USAGE` en `storefront_v1` + `SELECT` en sus vistas. Nada en `public`. | `storefront`, `storefront-worker` |
| `storefront_owner` | storefront | dueño; migraciones Prisma | servicio `storefront-migrate` |
| `storefront_app` | storefront | DML | `storefront`, `storefront-worker` |

Reglas:

- `REVOKE CONNECT ON DATABASE … FROM PUBLIC` en las dos bases.
- `ALTER DEFAULT PRIVILEGES FOR ROLE <owner>`, para que las tablas nuevas de cada migración le den permisos al rol `_app`.
- Ajustes de `storefront_reader`: `default_transaction_read_only = on`, `statement_timeout = '5s'`, `idle_in_transaction_session_timeout = '10s'`, `search_path = storefront_v1` y `CONNECTION LIMIT 10`.
- Las vistas usan `security_barrier`. Pertenecen a `tienda3d_owner` y corren con sus permisos, así que el lector no necesita acceso a las tablas.
- Nada de esto requiere superusuario: el mismo script corre en RDS.

### 5.4 Contrato de lectura `storefront_v1`

Vistas (columnas mínimas). Solo muestran publicaciones `PUBLISHED`, con producto del sistema activo
y precio calculado:

| Vista | Columnas |
| --- | --- |
| `products` | `id, slug, name, summary, description, seo_title, seo_description, option_label, featured, sort_order, published_at, updated_at` |
| `variants` | `id, product_id, sku, member_value_key, member_value_label, member_sort, price_cents, availability, available_quantity, max_per_order, lead_time_days, image_id, sort` |
| `variant_options` | `variant_id, option_kind ('member'\|'color'\|'attribute'), option_key, option_label, value_key, value_label, color_hex, option_sort, value_sort` |
| `images` | `id, product_id, path, alt, width, height, position, color_value_key` |
| `categories` | `id, slug, name, description, parent_id, image_path, sort_order` |
| `product_categories` | `product_id, category_id` |
| `slug_redirects` | `old_slug, product_slug` |
| `store_settings` | `shipping_flat_rate_cents, free_shipping_from_cents, pickup_enabled, pickup_instructions, bank_transfer_enabled, bank_transfer_instructions, notification_email` |

- Los montos se exponen en **centavos enteros** (el storefront ya trabaja así); tienda3d sigue con `Decimal(14,2)`.
- **Ninguna vista expone** costos, recetas, proveedores, markups, notas internas, clientes ni usuarios.
- Versionado: los cambios aditivos van en `v1`; un cambio que rompe crea `storefront_v2` y se convive hasta migrar el sitio.

### 5.5 Integración entre sistemas

**Del storefront a tienda3d.** Llamadas HTTP por la red interna a
`http://tienda3d-api:3001/api/integrations/storefront/v1/…`:

| Endpoint | Cuándo | Idempotencia |
| --- | --- | --- |
| `POST /orders` | al confirmar la compra (sincrónico, D2): valida precios contra el precio publicado, reserva stock y devuelve el código `W-AAAA-NNNN` | `externalId` = uuid del pedido del sitio |
| `POST /orders/{externalId}/events` | `payment_updated`, `cancelled_by_customer` (por outbox) | `eventId` |
| `POST /customers` | `customer.upserted` (por outbox) | id del cliente en el sitio |
| `POST /quote-requests` (multipart) | solicitud de personalización (por outbox) | id de la solicitud |
| `GET /ping` | health de la integración | — |

- **Autenticación:** `Authorization: Bearer <clave>`. La clave tiene 32 bytes aleatorios; tienda3d guarda solo su SHA-256 en `integration_clients` (con alcances, `lastUsedAt` y `revokedAt`) y la compara con `timingSafeEqual`.
- **Rotación:** se admiten dos claves activas a la vez durante el cambio.
- **Exposición:** la ruta es `@Public` para el JWT, pero lleva su propio guard y su propio límite. El proxy de `tienda3d-web` y Caddy devuelven 404 a `/api/integrations/*`: solo se llega por la red interna.

**De tienda3d al storefront.** Eventos a `http://storefront:3100/api/internal/events`:

| Evento | Efecto en el sitio |
| --- | --- |
| `catalog.changed {scope, ids}` | `revalidateTag` del catálogo, del producto o de los ajustes |
| `order.fulfillment_changed {externalId, status, tracking?}` | actualiza el pedido, suma al historial y manda mail al cliente |
| `order.payment_confirmed_manually {externalId}` | marca la transferencia como pagada y emite `payment_updated` de vuelta |

**Firma y entrega** (en los dos sentidos, para eventos):

- Cabeceras `X-TP-Event-Id`, `X-TP-Timestamp` y `X-TP-Signature: v1=<hex(HMAC-SHA256(secreto, timestamp + "." + cuerpo))>`.
- El receptor rechaza la firma inválida y los timestamps fuera de ±5 min, y deduplica por `eventId` en una tabla `inbound_events`.
- Hay un secreto distinto por sentido.
- **Outbox** en los dos lados (tabla `outbox_events`):
  - tienda3d despacha con `@nestjs/schedule` cada 15 s; el storefront, desde su worker.
  - Reintentos con backoff exponencial de 30 s a 1 h, durante 48 h.
  - Lo que no se entrega queda como alerta en el panel.
- **Trazabilidad:** `x-request-id` se propaga en cada llamada y evento, y queda en los logs de los dos lados.

### 5.6 Estados del pedido

El estado único de hoy (`domain/orders.ts`) mezcla pago y preparación. Se separa en dos ejes, cada
uno con un dueño:

| Eje | Dueño | Estados |
| --- | --- | --- |
| Pago (`paymentStatus`) | storefront | `PENDING` → `AWAITING_TRANSFER` → `APPROVED` · `REJECTED` · `REFUNDED` (este último en F19) |
| Preparación (`fulfillmentStatus`) | tienda3d | `RECEIVED` → `PREPARING` → `READY_FOR_PICKUP` (retiro) / `SHIPPED` con seguimiento (envío) → `DELIVERED` · `CANCELLED` |

Reglas:

- `PREPARING` exige pago `APPROVED`.
- `CANCELLED` libera el stock reservado.
- El cliente ve una etiqueta combinada ("Esperando tu transferencia", "En preparación", "Listo para retirar", "Enviado — seguimiento …", "Entregado", "Cancelado").
- Las transiciones por forma de entrega se portan desde `ADMIN_TRANSITIONS` del storefront.

### 5.7 Fotos y archivos

| Volumen | Escribe | Lee | Contenido |
| --- | --- | --- | --- |
| `media` | tienda3d-api | storefront (ro), tienda3d-api | `catalog/<webProductId>/<uuid>.webp`, `categories/<uuid>.webp` |
| `t3d-private` | tienda3d-api | tienda3d-api | adjuntos de solicitudes de personalización |
| `sf-private` | storefront | storefront | adjuntos pendientes de entregar (se borran al confirmarse la entrega) |

- Proceso al subir: verificación de tipo por *magic bytes* (jpg, png, webp), límite de 15 MB, `sharp` → WebP de máximo 2000 px y sin metadatos EXIF.
- Las dos apps corren con uid 1001: el volumen compartido no necesita permisos especiales.
- El almacenamiento queda detrás de un puerto (`MediaStorage`) para pasar a S3 si un día hay más de un host.

### 5.8 Secretos

**Principios:**

1. Nunca en el código, en las imágenes ni en `docker-compose.yml`. Los `.dockerignore` excluyen `.env*` y `secrets/`.
2. **Nunca como variable de entorno** en runtime: se montan como **archivos** en `/run/secrets/<nombre>` y las apps aceptan `NOMBRE_FILE` (F1·1). Así no aparecen en `docker inspect` ni los heredan los procesos hijos.
3. Un secreto por propósito y por ambiente. Nada compartido entre local y producción.
4. Validación al arrancar: en producción no se levanta con secretos faltantes, cortos o de ejemplo (F1·2).
5. Todo se puede **rotar** sin tocar código (runbook en F1·6).
6. Escaneo automático: gitleaks en los hooks locales `pre-commit` y `pre-push` (F1·4), sin GitHub Actions.

**Herramientas (todas gratuitas):**

| Ambiente | Dónde viven | Cómo llegan al contenedor |
| --- | --- | --- |
| Local | `tienda-plastik-infra/secrets/local/*.txt` (ignorado por git, permisos `600`), generados con `openssl rand` por `scripts/secrets/init-local.sh` | `secrets:` de Compose (archivos) |
| EC2 | **AWS Systems Manager Parameter Store**, parámetros `SecureString` de nivel **estándar** bajo `/tienda-plastik/prod/<servicio>/<nombre>`, cifrados con la clave administrada por AWS | Un servicio systemd (`fetch-secrets`) corre antes de `docker compose up`, lee por `GetParametersByPath` con el **rol IAM de la instancia** (sin claves de AWS en el disco) y escribe en tmpfs `/run/tienda-plastik/secrets` (`0400`, uid 1001), que Compose monta como `secrets:` |

**Costo del almacén en EC2:**

- Parameter Store no cobra los parámetros de nivel estándar ([AWS: tipos y niveles de parámetros](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html)).
- El descifrado de los `SecureString` usa KMS, que se factura aparte ([AWS: KMS y Parameter Store](https://docs.aws.amazon.com/kms/latest/developerguide/services-parameter-store.html)). KMS incluye **20.000 solicitudes por mes gratis** ([precios de KMS](https://aws.amazon.com/kms/pricing/)), y aquí las lecturas son unas pocas por arranque.
- Las alternativas pagas (Secrets Manager) no hacen falta.

**Inventario:**

| Secreto | Servicios | Uso |
| --- | --- | --- |
| `pg_superuser_password` | db (init) | administración |
| `tienda3d_owner_password` · `tienda3d_app_password` | tienda3d-migrate · tienda3d-api | base del sistema |
| `storefront_owner_password` · `storefront_app_password` | storefront-migrate · storefront, worker | base del sitio |
| `storefront_reader_password` | storefront, worker | lectura del catálogo |
| `jwt_secret` · `refresh_secret` | tienda3d-api | sesiones del panel |
| `seed_admin_password` | tienda3d-migrate (solo la primera vez) | admin inicial |
| `storefront_api_key` | storefront (en claro); en tienda3d se guarda su hash en la base | API de servicio |
| `events_secret_t3d_to_sf` · `events_secret_sf_to_t3d` | los dos | firma de eventos |
| `session_secret` (si hace falta para firmar tokens de email) | storefront | cuentas de cliente |
| `smtp_url` | storefront, worker | mails |
| `mp_access_token` · `mp_webhook_secret` | storefront (F19) | Mercado Pago |
| futuros: MELI, ARCA, WhatsApp | tienda3d-api | integraciones |

**Alternativas también gratuitas**, por si no se va a AWS o para versionar secretos de un ambiente de
prueba: **SOPS + age** (archivos cifrados en git), **Infisical** autoalojado y **Bitwarden Secrets
Manager** (plan gratuito).

### 5.9 Redes y puertos

| Servicio | Red | Puerto publicado en local | En EC2 |
| --- | --- | --- | --- |
| caddy | `edge` | 80 (y 443 con `tls internal`, opcional) | 80/443 (único abierto en el Security Group) |
| storefront · tienda3d-web | `edge` + `internal` | ninguno | ninguno |
| tienda3d-api · storefront-worker · migraciones | `internal` | ninguno | ninguno |
| db | `internal` | `127.0.0.1:5452` solo con el perfil `dev` | ninguno (RDS: Security Group solo desde la EC2) |
| mailpit | `internal` + `edge` | vía `correo.localhost` | no existe (SMTP real) |

---

## 6. Fases

Cada fase indica el repo, de qué depende, la estimación propuesta y sus tareas. Una tarea tiene
**Qué hacer** y **Cierra cuando**; la fase cierra con su **Verificación**.

| Fase | Tema | Repo | Depende de | Estimación |
| --- | --- | --- | --- | --- |
| F0 | Base de trabajo | t3d, sf | — | 3–5 h |
| F1 | Secretos y configuración | t3d, sf, infra | F0 | 8–12 h |
| F2 | Endurecer tienda3d para integrarse | t3d | F0 | 12–20 h |
| F3 | Ecosistema local en Docker | infra, t3d, sf | F1, F2·1, F2·6 | 10–16 h |
| F4 | Permisos de tienda online para `admin` | t3d | F0 | 2–4 h |
| F5 | Modelo del catálogo web | t3d | F2·2, F2·3, F4 | 16–24 h |
| F6 | Fotos en volumen | t3d | F3·5, F5·1 | 8–12 h |
| F7 | Precio publicado = Venta Directa | t3d | F5·2 | 8–12 h |
| F8 | Panel "Tienda online" | t3d | F5, F6, F7 | 24–36 h |
| F9 | Migración del catálogo actual | t3d | F8, D12 | 6–10 h |
| F10 | Contrato de lectura | t3d, infra | F5, F7 | 8–12 h |
| F11 | Integración entre sistemas | t3d, sf | F3, F10 | 12–18 h |
| F12 | El sitio lee el catálogo del sistema | sf | F9, F10, F11 | 12–18 h |
| F13 | Cuentas de cliente | sf | F12 | 20–30 h |
| F14 | Pedidos de punta a punta | t3d, sf | F11, F13 | 30–45 h |
| F15 | Solicitudes de personalización | t3d, sf | F11 | 8–12 h |
| F16 | Prueba integral local y decisión | infra, sf | F12–F15 | 12–18 h |
| **Local** | | | | **199–304 h** |
| F17 | Despliegue en EC2 (si F16 da "sí") | infra | F16 | 16–24 h |
| F18 | Base en RDS (largo plazo) | infra | F17 | 6–10 h |
| F19 | Mercado Pago | sf | F17 | 10–16 h |
| F20 | Lanzamiento y baja del WordPress | infra, sf | F17 | 6–10 h |

Lo que se puede hacer en paralelo: F4 con F2; F15 con F13; F9 en cuanto F8 permite cargar datos.

---

### F0 — Base de trabajo · 3–5 h

> **Objetivo:** repos en un punto estable, datos sensibles fuera de los repos y decisiones confirmadas.

- [ ] **F0·1 [t3d] Integrar la rama de auditoría**
  - Qué hacer:
    - Commitear el rename de `docs/FUNCIONALIDADES.md` → `docs/funcionalidades-sistema-gestion.md`.
    - Pushear `fix/auditoria-correcciones`.
    - Mergearla a `develop` y `develop` a `main` (o definir que `develop` es la base y dejarlo escrito).
  - Cierra cuando: la rama base de tienda3d contiene `dba0c3a` y `git status` está limpio.
- [ ] **F0·2 Sacar los volcados de las carpetas de los repos**
  - Qué hacer: mover `tienda3d_dump_2026-07-22.sql` a una carpeta de respaldos fuera de los repos, con el disco cifrado (FileVault). Revisar que no queden otros `*.sql` o `*.dump`.
  - Cierra cuando: `find <repos> -maxdepth 2 -name '*.sql'` no devuelve volcados con datos.
- [ ] **F0·3 Confirmar D1–D11** y anotar la respuesta en §3.
  - Cierra cuando: §3 no tiene propuestas sin confirmar que bloqueen F1–F5.
- [ ] **F0·4 Línea de base en verde**
  - Qué hacer: correr la verificación mínima de los dos repos y la e2e del storefront.
  - Cierra cuando: la bitácora registra los resultados (o los tests que fallan, con su motivo).
- [ ] **F0·5 Pedido de conciliación a la dueña (D12)**
  - Qué hacer: armar el pedido con las 4 diferencias de §4.8 (TPK/PTK, Noche/Día, Riso, 380 vs 390), los 11 colores y a qué línea de filamento pertenecen, y el aviso de que los precios cambian (T5).
  - Cierra cuando: el pedido está enviado; su respuesta desbloquea F9.

**Verificación:** las cinco tareas cerradas.

---

### F1 — Secretos y configuración · 8–12 h

> **Objetivo:** los dos sistemas leen secretos desde archivos, rechazan valores débiles y no se puede
> commitear un secreto sin que salte una alarma.

- [ ] **F1·1 [t3d][sf] Leer secretos desde archivo**
  - Qué hacer:
    - Crear un helper `readSecret(name)`: si existe `NAME_FILE`, lee el archivo y recorta el salto de línea; si no, usa `NAME`.
    - [t3d]: crear `apps/api/src/common/config/env.schema.ts` (zod) con **todas** las variables de §4.2, validado al arrancar (`ConfigModule.forRoot({ validate })`), y reemplazar las lecturas sueltas de `ConfigService.get` por el objeto tipado.
    - [t3d]: Prisma toma `DATABASE_URL`; armarla desde partes (`DB_HOST`, `DB_USER`, `DB_PASSWORD_FILE`…) en el arranque, antes de instanciar `PrismaService`.
    - [sf]: aplicar lo mismo en `src/server/env.ts`.
  - Cierra cuando:
    - con `JWT_SECRET_FILE=/run/secrets/jwt_secret` y sin `JWT_SECRET`, la API arranca;
    - con ambos ausentes, falla con un mensaje claro;
    - hay tests unitarios del helper y del esquema en los dos repos.
- [ ] **F1·2 [t3d][sf] Validación de arranque ampliada**
  - Qué hacer:
    - [t3d]: sumar a `assertSecrets` la clave de la base, `SEED_ADMIN_PASSWORD` (si corre el seed) y las credenciales de integraciones habilitadas.
    - [sf]: en `production`, exigir `SITE_URL` https, secretos de ≥32 caracteres, `PAYMENTS_PROVIDER ≠ fake` y las claves de MP si el proveedor es `mercadopago`.
    - Los dos rechazan los valores de ejemplo conocidos (`changeme`, `admin123`, `cambiar-esta-clave`, `plastik-dev`, `replace-with-…`).
  - Cierra cuando: hay un test por regla, y arrancar en `production` con un valor de ejemplo corta con el nombre de la variable.
- [ ] **F1·3 [infra] Generador de secretos locales**
  - Qué hacer: `scripts/secrets/init-local.sh` crea cada archivo del inventario (§5.8) con `openssl rand -base64 32`, permisos `600`, **sin pisar los que existen**, e imprime la lista (no los valores).
  - Cierra cuando: correrlo dos veces no cambia ningún archivo, y `git status` no los muestra.
- [ ] **F1·4 [t3d][sf][infra] gitleaks en los hooks locales**
  - Qué hacer:
    - `.gitleaks.toml` con una allowlist acotada: `apps/api/src/common/config/validate-secrets.spec.ts` en [t3d] y el commit `a23354bc` en [sf].
    - lefthook como devDependency (se instala solo con `pnpm install`; en [infra], binario de brew):
      - `pre-commit` corre `gitleaks git --staged`;
      - `pre-push` corre `gitleaks git` sobre los commits que se suben.
    - Script `scripts/hooks/gitleaks.sh` que usa el binario local y, si no está, la imagen `zricethezav/gitleaks`.
    - Documentarlo en el README de cada repo. **Sin GitHub Actions.**
  - Cierra cuando:
    - un commit con un token falso se rechaza en local;
    - el escaneo del historial completo da 0 hallazgos fuera de la allowlist.
- [ ] **F1·5 [t3d] Rotar las credenciales débiles locales (F-23)**
  - Qué hacer:
    - `ALTER USER` del Postgres local con la clave nueva y cambio de la clave del admin desde el panel.
    - Mover los dos valores a archivos de secretos.
    - **Pedir OK antes**, porque toca la base en uso.
  - Cierra cuando: el `.env` de [t3d] no contiene `changeme` ni `admin123`, y el login funciona con la clave nueva.
- [ ] **F1·6 [infra] Inventario y runbook de rotación**
  - Qué hacer: escribir `docs/secretos.md` con la tabla de §5.8, el procedimiento de rotación de cada secreto (base, JWT, clave de API con dos activas, secretos de eventos, MP) y qué reiniciar en cada caso.
  - Cierra cuando: hay una rotación de prueba de `storefront_api_key` hecha siguiendo el runbook, sin cortar la integración (después de F11).

**Verificación:** tests de los dos repos en verde; `gitleaks git` en verde en los tres repos.

---

### F2 — Endurecer tienda3d para integrarse · 12–20 h

> **Objetivo:** que el sistema sea una fuente de verdad confiable para la web y se pueda construir
> como en producción.

- [ ] **F2·1 La imagen de producción de la web compila (F-30)**
  - Qué hacer: seguir los pasos que dejó el plan de auditoría (§F-30 de `correcciones-auditoria-2026-08.md`): reproducir con `docker build --target build`, probar `pnpm deploy --filter web` o copiar el workspace completo al stage de build, y `outputFileTracingRoot`.
  - Cierra cuando: `docker compose -f docker-compose.yml build web` termina y `/login` responde 200 desde la imagen.
- [ ] **F2·2 Editar un producto no cambia lo que no se tocó**
  - Qué hacer:
    - En el PUT, `isActive` omitido conserva el valor actual.
    - `channels` omitido conserva los canales.
    - La respuesta del PUT respeta la visibilidad de `notes`.
  - Cierra cuando: hay tests de integración para los tres casos (producto archivado, Directa apagada y usuario sin `parameter:write`).
- [ ] **F2·3 Las piezas conservan su identidad al editar**
  - Qué hacer: el PUT hace upsert de las piezas por `id` (crea las nuevas, actualiza las existentes y borra solo las quitadas). Agregar `id` opcional a `pieceSchema` y mandarlo desde `product-editor.tsx`.
  - Cierra cuando: editar los gramos de una pieza mantiene su `id` (test), y las órdenes de producción existentes no se rompen.
- [ ] **F2·4 Los filtros `activeOnly` funcionan con "false"**
  - Qué hacer: reemplazar `z.coerce.boolean` por un parser de `'true'`/`'false'` en `materials.controller.ts:59` y `categories.controller.ts:37`.
  - Cierra cuando: un test con `activeOnly=false` devuelve los inactivos.
- [ ] **F2·5 Producir llaveros consume solo las piezas de su escala**
  - Qué hacer: en `productions.service.ts` (consumo y costo), usar las piezas `INDIVIDUAL` para cantidades 1–4 y `BATCH ÷ keychain_batch_size` para 5+, igual que las cotizaciones.
  - Cierra cuando: un test con un producto KEYCHAIN da el mismo consumo que la cotización para 1 y para 10 unidades.
- [ ] **F2·6 La API funciona con un rol sin privilegios**
  - Qué hacer:
    - Sacar `prisma migrate deploy` del CMD de `apps/api/Dockerfile` y crear el target o comando `migrate`, que corre con `MIGRATION_DATABASE_URL` (owner) y después aplica `db/grants.sql` (F10·2).
    - La API usa `DATABASE_URL` con `tienda3d_app`.
    - Documentar en el README cómo se corre en local sin el repo de infra.
  - Cierra cuando: con la API conectada como `tienda3d_app`, toda la suite de integración pasa y un `CREATE TABLE` desde esa conexión falla.
- [ ] **F2·7 Verificación local antes de integrar**
  - Qué hacer:
    - Hooks de lefthook (los de F1·4 más los de verificación):
      - `pre-commit` corre formato y lint de los archivos tocados;
      - `pre-push` corre `pnpm typecheck` y los tests unitarios.
    - Script `pnpm verify` que corre typecheck, lint, tests unitarios y tests de integración. Para la integración levanta un Postgres efímero con `docker run --rm` si no hay `TEST_DATABASE_URL`.
    - **Sin GitHub Actions.**
  - Cierra cuando:
    - un push con un test roto se rechaza;
    - `pnpm verify` en verde desde un clon limpio.
- [ ] **F2·8 Request id de punta a punta**
  - Qué hacer:
    - `pinoHttp.genReqId` toma `x-request-id` si viene y, si no, genera uno.
    - La API devuelve el id en la respuesta.
    - El proxy de la web lo reenvía.
  - Cierra cuando: un request con `x-request-id: prueba-123` aparece con ese id en el log de la API.
- [ ] **F2·9 Refresco proactivo en todas las rutas protegidas**
  - Qué hacer: sumar `/clientes`, `/categorias`, `/reportes` y `/tienda-online` a `PROTECTED_PREFIX` (`apps/web/src/proxy.ts`).
  - Cierra cuando: navegar a `/clientes` con el access token por vencer lo refresca sin pasar por el login.

**Verificación:** `pnpm verify` de [t3d] en verde y build de las dos imágenes de producción.

---

### F3 — Ecosistema local en Docker · 10–16 h

> **Objetivo:** levantar todo el ecosistema, como en producción, con un solo comando.

- [ ] **F3·1 [infra] Crear el repo `tienda-plastik-infra`** (D1)
  - Qué hacer: crear el repo privado en la carpeta madre con:
    - `compose.yaml`, `compose.dev.yaml`, `Caddyfile`;
    - `db/init/`, `scripts/` y `docs/`;
    - `secrets/` en `.gitignore`;
    - un README con el arranque.
  - Cierra cuando: el repo existe en GitHub y `CLAUDE.md` de la carpeta madre lo lista.
- [ ] **F3·2 [infra] Un Postgres con dos bases y sus roles**
  - Qué hacer:
    - `db/init/00-roles.sh` lee `/run/secrets/*` y crea los roles y las bases de §5.3 con `REVOKE CONNECT … FROM PUBLIC`.
    - Debe ser idempotente y no requerir superusuario más allá del init, para reusarlo en RDS (F18).
    - El puerto se publica solo en `127.0.0.1:5452` con el perfil `dev`.
  - Cierra cuando: `storefront_reader` no puede conectarse a la base `storefront`, `storefront_app` no puede conectarse a `tienda3d` y `tienda3d_app` no puede hacer DDL.
- [ ] **F3·3 [infra] Servicios del ecosistema**
  - Qué hacer:
    - Servicios `db`, `tienda3d-migrate`, `tienda3d-api`, `tienda3d-web`, `storefront-migrate`, `storefront`, `storefront-worker` (desde F11), `mailpit` y `caddy`.
    - `build.context` apunta a `../tienda3d` y `../tienda-plastik-page/storefront`.
    - Healthchecks en todos y `depends_on` con `service_healthy` / `service_completed_successfully`.
    - `restart: unless-stopped`, logs `json-file` con `max-size`.
  - Cierra cuando: desde cero (sin volúmenes), `docker compose up -d --build` deja todo en `healthy`, con los dos sitios respondiendo.
- [ ] **F3·4 [infra] Caddy como única puerta**
  - Qué hacer:
    - `tienda.localhost` → storefront, `sistema.localhost` → tienda3d-web, `correo.localhost` → mailpit.
    - Responde 404 a `/api/internal/*` y `/api/integrations/*`.
    - Cabeceras de seguridad (HSTS solo con TLS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) y `x-request-id`.
    - `tls internal` opcional para probar cookies `Secure`.
  - Cierra cuando: `curl http://tienda.localhost/api/internal/events` da 404 desde el host, y desde la red interna da 401 sin firma (después de F11).
- [ ] **F3·5 [infra] Volúmenes**
  - Qué hacer: crear `pgdata`, `media` (rw en tienda3d-api, `:ro` en storefront y worker), `t3d-private`, `sf-private` y `backups`, con uid 1001.
  - Cierra cuando: la API escribe un archivo en `media`, el storefront lo lee, y escribir desde el storefront falla con `EROFS`.
- [ ] **F3·6 [infra] Secretos como archivos**
  - Qué hacer: sección `secrets:` de Compose con los archivos de `secrets/local/`; cada servicio monta solo los suyos y recibe `*_FILE`. `NODE_ENV=production` en el perfil por defecto.
  - Cierra cuando: `docker inspect` de cada contenedor no contiene ningún valor de `secrets/local/`, y las cookies del sistema salen con `Secure` bajo `tls internal`.
- [ ] **F3·7 [infra] Backup y restauración**
  - Qué hacer:
    - `scripts/backup.sh` hace `pg_dump -Fc` de las dos bases y `tar` de `media` y de los privados, con fecha, a `backups/`.
    - `scripts/restore.sh` pide confirmación antes de pisar.
    - `make up/down/logs/backup/restore/ps`.
  - Cierra cuando: un backup restaurado en un ecosistema limpio deja los dos sitios con los mismos datos y fotos.
- [ ] **F3·8 [infra] Perfil de desarrollo**
  - Qué hacer: `compose.dev.yaml` con bind mounts y hot reload de las dos apps sobre el mismo Postgres.
  - Cierra cuando: un cambio en un componente del storefront o del panel se ve sin reconstruir la imagen.

**Verificación:** desde un clon limpio, `scripts/secrets/init-local.sh && make up` deja el ecosistema
funcionando, y `make backup && make restore` funciona.

---

### F4 — Permisos de tienda online para `admin` · 2–4 h

> **Objetivo:** que solo el rol `admin` (T1) vea y gestione la tienda online.

- [ ] **F4·1 Permisos nuevos**
  - Qué hacer:
    - Crear `ecommerce:read`, `ecommerce:write` (catálogo web y fotos), `ecommerce:orders` (pedidos, clientes web y solicitudes) y `ecommerce:settings` (ajustes de la tienda), con descripción en español.
    - Migración con `INSERT … ON CONFLICT DO NOTHING` de los permisos y su asignación al rol `admin`.
    - En `seed.ts`: sumarlos a `PERMISSIONS` y **excluirlos** de `operator` y de `viewer`, que toma todas las `:read`.
  - Cierra cuando:
    - un test del seed comprueba que `admin` los tiene y `operator`/`viewer` no;
    - `route-permissions.spec.ts` reconoce las claves;
    - aplicar la migración sobre una copia de la base en uso se los da al admin actual.
- [ ] **F4·2 Grupo "Tienda online" en el menú**
  - Qué hacer: agregar el grupo en `apps/web/src/components/nav.ts` (Publicaciones, Pedidos web, Clientes web, Solicitudes, Categorías web, Ajustes), cada ítem con su permiso.
  - Cierra cuando: con el usuario `operator` el grupo no aparece y las rutas redirigen; con `admin`, sí.

**Nota:** el RBAC es dinámico, así que un admin podría darle `ecommerce:*` a otro rol desde
Administración → Roles. Es aceptable, porque solo el admin tiene `role:manage`.

**Verificación:** verificación mínima de [t3d].

---

### F5 — Modelo del catálogo web · 16–24 h

> **Objetivo:** que el sistema pueda describir todo lo que muestra la tienda, sin tocar el modelo de
> costeo.

- [ ] **F5·1 Esquema y migración**
  - Qué hacer: crear los modelos (borrador abajo) con `@@map` snake_case y columnas camelCase, como el resto. Agregar el módulo `apps/api/src/modules/web-catalog/` y sus schemas y DTOs en `packages/shared/src/schemas/web-catalog.ts` + `types/web-catalog.ts`.
  - Cierra cuando: la migración aplica sobre una base vacía y sobre una copia de la base en uso.

  ```prisma
  enum WebProductStatus { DRAFT PUBLISHED HIDDEN }
  enum WebAvailability  { MADE_TO_ORDER STOCK_ONLY STOCK_THEN_ORDER }
  enum WebPriceState    { OK NO_PRICE }

  model WebProduct {            // "publicación": lo que el cliente ve como un producto
    id             String   @id @default(cuid())
    slug           String   @unique
    name           String
    summary        String   @default("")
    description    String   @default("")      // formato de texto simple del storefront
    seoTitle       String?
    seoDescription String?
    optionLabel    String   @default("Modelo") // nombre de la opción de los miembros: "Tamaño", "Modelo"…
    status         WebProductStatus @default(DRAFT)
    publishedAt    DateTime?
    featured       Boolean  @default(false)
    sortOrder      Int      @default(0)
    members        WebProductMember[]
    colorOptions   WebColorOption[]
    attributes     WebAttribute[]
    variants       WebVariant[]
    images         WebImage[]
    categories     WebProductCategory[]
    slugHistory    WebProductSlug[]
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt
    @@map("web_products")
  }

  model WebProductMember {      // producto del sistema que es una variante de la publicación (T7)
    id           String  @id @default(cuid())
    webProductId String
    productId    String  @unique   // un producto del sistema está en una sola publicación
    valueLabel   String            // "280", "390"; vacío si la publicación tiene un solo miembro
    sortOrder    Int     @default(0)
    isActive     Boolean @default(true)
    @@map("web_product_members")
  }

  model WebColorOption {        // T8: colores elegidos de una línea de filamento
    id             String @id @default(cuid())
    webProductId   String
    label          String @default("Color")    // "Color", "Color de la tapa"…
    filamentLineId String                      // Material padre (FILAMENT, parentId null)
    sortOrder      Int    @default(0)
    values         WebColorValue[]             // subconjunto de hijos activos de la línea
    pieces         WebColorOptionPiece[]       // qué piezas de cada miembro toman este color
    @@map("web_color_options")
  }
  model WebColorValue       { optionId String; materialId String; sortOrder Int @default(0); @@id([optionId, materialId]); @@map("web_color_values") }
  model WebColorOptionPiece { optionId String; pieceId String; @@id([optionId, pieceId]); @@map("web_color_option_pieces") }

  model WebAttribute {          // D6: opciones informativas, sin impacto en el precio ("Tipo de hoja")
    id           String @id @default(cuid())
    webProductId String
    label        String
    sortOrder    Int    @default(0)
    values       WebAttributeValue[]
    @@map("web_attributes")
  }
  model WebAttributeValue { id String @id @default(cuid()); attributeId String; slug String; label String; sortOrder Int @default(0); @@unique([attributeId, slug]); @@map("web_attribute_values") }

  model WebVariant {            // combinación vendible: miembro × colores × atributos
    id             String  @id @default(cuid())
    webProductId   String
    memberId       String
    sku            String  @unique            // "<SKU del miembro>-VNN", inmutable
    selectionKey   String                     // clave canónica de la combinación
    isActive       Boolean @default(true)
    availability   WebAvailability @default(MADE_TO_ORDER)
    stockQuantity  Int     @default(0)
    maxPerOrder    Int?
    leadTimeDays   Int?
    imageId        String?
    legacySku      String?                    // SKU que tenía en WooCommerce
    selections     WebVariantSelection[]
    @@unique([webProductId, selectionKey])
    @@map("web_variants")
  }
  model WebVariantSelection { variantId String; colorOptionId String?; materialId String?; attributeValueId String?; @@map("web_variant_selections") }

  model WebImage { id String @id @default(cuid()); webProductId String; path String; alt String @default(""); width Int; height Int; position Int @default(0); colorMaterialId String?; @@map("web_images") }
  model WebCategory { id String @id @default(cuid()); slug String @unique; name String; description String @default(""); parentId String?; imagePath String?; sortOrder Int @default(0); isActive Boolean @default(true); @@map("web_categories") }
  model WebProductCategory { webProductId String; webCategoryId String; @@id([webProductId, webCategoryId]); @@map("web_product_categories") }
  model WebProductSlug { slug String @id; webProductId String; createdAt DateTime @default(now()); @@map("web_product_slugs") }

  model WebPrice {              // precio publicado por producto del sistema (F7)
    productId   String   @id
    price       Decimal? @db.Decimal(14, 2)
    state       WebPriceState
    reason      String?            // por qué no hay precio
    inputsHash  String
    computedAt  DateTime
    @@map("web_prices")
  }
  model WebPriceHistory { id String @id @default(cuid()); productId String; previous Decimal? @db.Decimal(14, 2); price Decimal? @db.Decimal(14, 2); changedAt DateTime @default(now()); cause String; @@index([productId, changedAt]); @@map("web_price_history") }

  model EcommerceSettings {     // fila única id = 1
    id                       Int     @id @default(1)
    shippingFlatRate         Decimal? @db.Decimal(14, 2)
    freeShippingFrom         Decimal? @db.Decimal(14, 2)
    pickupEnabled            Boolean @default(true)
    pickupInstructions       String  @default("")
    bankTransferEnabled      Boolean @default(false)
    bankTransferInstructions String  @default("")
    notificationEmail        String  @default("")
    updatedAt                DateTime @updatedAt
    @@map("ecommerce_settings")
  }
  ```

- [ ] **F5·2 Publicaciones y miembros**
  - Qué hacer:
    - Endpoints `GET/POST /web-catalog/products`, `GET/PATCH /web-catalog/products/:id`, `PUT /web-catalog/products/:id/members` (`ecommerce:read` / `ecommerce:write`).
    - Reglas: un producto del sistema pertenece a una sola publicación, debe estar activo y tener Venta Directa habilitada.
    - Al cambiar el `slug`, el viejo queda en `WebProductSlug`.
    - Auditoría con `AuditService.record`.
  - Cierra cuando: hay tests de integración de las reglas, del cambio de slug y del rechazo de un producto que ya está en otra publicación.
- [ ] **F5·3 Colores elegidos por filamento (T8)**
  - Qué hacer:
    - `PUT /web-catalog/products/:id/color-options`. Cada opción tiene línea de filamento, colores elegidos y piezas.
    - Por defecto, las piezas son todas las de los miembros cuyo `defaultFilamentId` es esa línea.
    - Validar que la línea esté usada por las piezas elegidas y que cada color sea un hijo **activo** de esa línea.
    - Si un color se desactiva en Insumos, las variantes que lo usan dejan de venderse y el panel lo avisa.
  - Cierra cuando: hay tests que rechazan un color de otra línea, un color inactivo y una pieza de otro producto.
- [ ] **F5·4 Atributos informativos (D6)**
  - Qué hacer: `PUT /web-catalog/products/:id/attributes` (etiqueta + valores ordenados).
  - Cierra cuando: un cuaderno con "Tipo de hoja: Cuadro/Punto" genera variantes por cada valor, con el mismo precio.
- [ ] **F5·5 Variantes**
  - Qué hacer:
    - `POST /web-catalog/products/:id/variants/regenerate`: arma la matriz miembro × valores de cada opción de color × valores de cada atributo, portando `planVariants` (conserva, crea y desactiva; nunca borra una variante con pedidos).
    - SKU nuevo `<SKU del miembro>-VNN` con un contador por miembro, inmutable.
    - `PATCH /web-catalog/variants/:id` para activa, disponibilidad (D9), stock, máximo por pedido, plazo y foto.
    - Portar las reglas de disponibilidad de `storefront/src/domain/catalog.ts` (`variantAvailability`) a un dominio puro con tests.
  - Cierra cuando: regenerar la Trapecio (2 miembros × 4 colores) da 8 variantes; quitar un color desactiva 2 y conservarlo no cambia los SKU.
- [ ] **F5·6 Categorías web**
  - Qué hacer: CRUD `/web-catalog/categories` (dos niveles, slug, descripción, foto y orden) y la asignación a publicaciones.
  - Cierra cuando: no se puede borrar una categoría con publicaciones o hijas (test).
- [ ] **F5·7 Botón publicar / ocultar**
  - Qué hacer:
    - `POST /web-catalog/products/:id/publish` y `/hide`. `DRAFT → PUBLISHED ↔ HIDDEN`.
    - Antes de publicar se verifica: slug, al menos 1 foto, al menos 1 variante activa con precio `OK` y descripción.
    - Al publicar se responde con la lista de lo que falta.
    - Cada cambio registra auditoría y un evento `catalog.changed` en el outbox (la tabla llega en F11·3; hasta entonces, un no-op detrás de una interfaz).
  - Cierra cuando: hay tests del checklist y del ida y vuelta publicar → ocultar → publicar.
- [ ] **F5·8 Ajustes de la tienda**
  - Qué hacer: `GET/PUT /web-catalog/settings` (`ecommerce:settings`) sobre `EcommerceSettings`.
  - Cierra cuando: un test cubre el guardado y la validación (montos ≥ 0, email válido).

**Verificación:** verificación mínima de [t3d]; `route-permissions.spec.ts` cubre las rutas nuevas.

---

### F6 — Fotos en volumen · 8–12 h

> **Objetivo:** subir, ordenar y borrar fotos desde el sistema, guardadas en el volumen `media` (T9).

- [ ] **F6·1 Puerto `MediaStorage` con adaptador de disco**
  - Qué hacer: `apps/api/src/common/storage/` con `save`, `delete` y `read` sobre `MEDIA_DIR` (y `PRIVATE_DIR`), con rutas generadas por el sistema y control de *path traversal*.
  - Cierra cuando: un test intenta `../` y falla.
- [ ] **F6·2 Subida de fotos**
  - Qué hacer:
    - `POST /web-catalog/products/:id/images` (multipart con `FileInterceptor`, `memoryStorage`, máximo 15 MB y 10 archivos).
    - Verificar el tipo por *magic bytes* y procesar con `sharp`: WebP, 2000 px como máximo, sin EXIF, guardando ancho y alto.
    - `PATCH …/images/:imageId` (alt, posición, color) y `DELETE` (borra la fila y el archivo).
    - El límite JSON global de `1mb` no aplica a esta ruta.
  - Cierra cuando: hay tests con un JPG real, un archivo `.jpg` que en realidad es texto (rechazado) y uno de 16 MB (rechazado).
- [ ] **F6·3 Ver las fotos en el panel**
  - Qué hacer: `GET /web-catalog/media/*` autenticado (`ecommerce:read`), con `Cache-Control` privado.
  - Cierra cuando: el panel muestra una foto subida.
- [ ] **F6·4 Fotos de categoría**
  - Qué hacer: lo mismo en `/web-catalog/categories/:id/image`.
  - Cierra cuando: hay un test de subida y reemplazo, y el archivo viejo se borra.

**Verificación:** verificación mínima de [t3d]; con el ecosistema arriba, el archivo aparece en el volumen `media`.

---

### F7 — Precio publicado = Venta Directa · 8–12 h

> **Objetivo:** que el precio web sea siempre el de Venta Directa a cliente normal, cantidad 1 (T5),
> sin cargarlo a mano.

- [ ] **F7·1 Cálculo del precio publicado**
  - Qué hacer:
    - `WebPriceService.computeFor(productId)` usa `PricingService.forProduct` y toma el bloque `directa`: `base.finalPrice` o el tier con `minQty = 1`; en KEYCHAIN, la banda 1–4.
    - Si no hay bloque (Directa deshabilitada) o no hay markup, guarda `NO_PRICE` con el motivo.
    - `inputsHash` sirve para no escribir cuando nada cambió.
  - Cierra cuando: un test compara el precio publicado con el que muestra `GET /products/:id/prices` para un producto sin escalas, uno con escalas y un llavero.
- [ ] **F7·2 Recálculo automático**
  - Qué hacer:
    - Después de cada escritura de la lista de §4.3 (al confirmarse la transacción), llamar a `WebPriceService.recomputePublished()` con *debounce* de 2 s. Son unas decenas de productos, así que se recalculan todos los publicados.
    - Sumar un cron de respaldo cada 10 min y un botón "Recalcular precios" (`ecommerce:write`).
    - Si algún precio cambió, registrar `WebPriceHistory` y emitir `catalog.changed`.
  - Cierra cuando: cambiar el precio vigente de "PLA Genérico" actualiza en menos de 5 s el precio publicado de todos los productos que lo usan (test de integración con el reloj controlado).
- [ ] **F7·3 Historial de precios**
  - Qué hacer: `GET /web-catalog/prices/:productId/history`.
  - Cierra cuando: el panel muestra los últimos cambios con su causa.
- [ ] **F7·4 Alertas**
  - Qué hacer: el listado de publicaciones marca las variantes sin precio y por qué ("Venta Directa deshabilitada", "La categoría no tiene markup").
  - Cierra cuando: un producto sin markup no se puede publicar y el mensaje dice cómo resolverlo.

**Verificación:** verificación mínima de [t3d].

---

### F8 — Panel "Tienda online" · 24–36 h

> **Objetivo:** que el admin gestione toda la tienda desde tienda3d sin tocar la base. El punto de
> entrada es la ficha del producto, con el botón de visibilidad.

- [ ] **F8·1 Componentes que faltan**
  - Qué hacer: `components/ui/{dialog,tabs,switch,textarea,select,badge}.tsx`, con el mismo estilo que los existentes (cva y tokens de `theme/tokens.css`).
  - Cierra cuando: se usan en F8·2–F8·6, y `product-editor.tsx` puede seguir con sus nativos.
- [ ] **F8·2 Sección "Tienda online" en la ficha del producto**
  - Qué hacer:
    - Crear `productos/[id]/product-web-section.tsx` y renderizarla en `productos/[id]/page.tsx`, debajo del editor. Es visible con `ecommerce:read` y editable con `ecommerce:write`, con su propio `useEditMode`.
    - Muestra: la publicación a la que pertenece y su estado, el **interruptor "Visible en la tienda"** (publica u oculta la publicación y muestra el checklist si falta algo), el precio publicado y su estado, el link al editor y "Ver en la tienda".
    - Si el producto no está publicado: botón **"Crear publicación con este producto"**, que precarga nombre y descripción.
  - Cierra cuando: desde la ficha de "Lina" se crea la publicación, se completa, se hace visible y se oculta, sin salir del flujo.
- [ ] **F8·3 Listado de publicaciones**
  - Qué hacer: `/tienda-online/publicaciones` con foto, nombre, estado, rango de precio, variantes activas/total, alertas (sin precio, color inactivo, sin fotos) y filtro por estado.
  - Cierra cuando: las 13 publicaciones migradas (F9) se ven con sus alertas.
- [ ] **F8·4 Editor de publicación**
  - Qué hacer: `/tienda-online/publicaciones/[id]` con pestañas:
    - **Contenido**: nombre, slug, resumen, descripción con vista previa del formato simple y SEO.
    - **Variantes**: miembros con su etiqueta, opciones de color (línea, colores elegidos con swatches y piezas), atributos, matriz generada con edición en línea de activa, disponibilidad, stock, máximo y plazo.
    - **Fotos**: subir, arrastrar para ordenar, alt, asociar a un color y borrar con confirmación.
    - **Categorías**.
    - **Publicación**: checklist, historial de precios y link a la vista en el sitio.
  - Cierra cuando: se arma la Trapecio (2 productos del sistema, 4 colores, fotos por color) de punta a punta.
- [ ] **F8·5 Categorías web**
  - Qué hacer: `/tienda-online/categorias` con árbol, alta y edición en diálogo, foto y orden.
  - Cierra cuando: se crea "Lámpara > Lámpara de mesa" con foto.
- [ ] **F8·6 Ajustes de la tienda**
  - Qué hacer: `/tienda-online/ajustes` (envíos, retiro, transferencia y email de avisos).
  - Cierra cuando: guardar cambia lo que muestra el checkout (después de F12).
- [ ] **F8·7 Tipos compartidos**
  - Qué hacer: las pantallas nuevas usan los DTOs de `packages/shared` y no los redeclaran.
  - Cierra cuando: `grep` no encuentra tipos `Web*Dto` declarados en `apps/web`.

**Verificación:** verificación mínima de [t3d], y un recorrido manual del admin con capturas en la bitácora.

---

### F9 — Migración del catálogo actual · 6–10 h

> **Objetivo:** que todo lo que hoy muestra el sitio exista en el sistema, conciliado con la dueña.
> **Bloqueada por D12** (respuesta de F0·5).

- [ ] **F9·1 Colores de filamento**
  - Qué hacer: cargar como hijos de la línea que indique la dueña (por defecto "PLA Genérico") los colores de §4.8 que falten, con su `colorHex`, desde el panel de Insumos o con un script idempotente.
  - Cierra cuando: `GET /materials?type=FILAMENT` devuelve los 11 colores.
- [ ] **F9·2 Script de importación**
  - Qué hacer:
    - `apps/api/scripts/import-storefront-catalog.ts` lee `storefront/prisma/seed/catalog.json` y `media/` y mapea por la tabla conciliada.
    - Crea publicaciones, miembros, opciones de color con los colores que tiene cada producto, atributos, variantes (con el SKU viejo en `legacySku`), fotos copiadas al volumen, categorías web, contenido y SEO.
    - Las disponibilidades se copian del storefront.
    - Opción `--dry-run` con reporte. Es idempotente (vuelve a correr sin duplicar).
  - Cierra cuando: el dry-run no tiene errores, y la importación deja publicaciones y variantes equivalentes a §4.8 (13 y 52, salvo lo que cambie la conciliación).
- [ ] **F9·3 Reporte de precios para la dueña**
  - Qué hacer: comparar por variante el precio web actual contra el precio publicado nuevo (Venta Directa), con la diferencia en pesos y en porcentaje.
  - Cierra cuando: el reporte está entregado y la dueña confirma o pide ajustar markups o categorías **en el sistema** (no en la web).

**Verificación:** recorrido del panel con las 13 publicaciones en estado `HIDDEN`. Se publican recién en F12.

---

### F10 — Contrato de lectura · 8–12 h

> **Objetivo:** que el sitio pueda leer solo lo publicado, con un usuario que no puede ver ni
> escribir nada más (T3).

- [ ] **F10·1 Esquema `storefront_v1` y vistas**
  - Qué hacer: migración SQL con las vistas de §5.4, `WITH (security_barrier)`, filtrando `status = 'PUBLISHED'`, producto del sistema activo, miembro activo y precio `OK`. Montos en centavos (`(price * 100)::int`).
  - Cierra cuando: la migración aplica en limpio, y una publicación oculta, un producto archivado o una variante sin precio no aparecen.
- [ ] **F10·2 Permisos del lector**
  - Qué hacer: `db/grants.sql` idempotente, corrido por `tienda3d-migrate` después de `migrate deploy`, con `GRANT USAGE` + `SELECT ON ALL TABLES IN SCHEMA storefront_v1` y los ajustes del rol de §5.3. El rol lo crea el init de infra (F3·2); los tests lo crean en su setup.
  - Cierra cuando: después de una migración nueva, el lector sigue leyendo sin pasos manuales.
- [ ] **F10·3 Tests de contrato**
  - Qué hacer: `apps/api/test/storefront-contract.int-spec.ts` conecta como `storefront_reader` y verifica:
    - (a) puede leer cada vista;
    - (b) `SELECT` en `public.users`, `public.supplier_materials`, `public.customers`, `public.quotes` y `public.web_products` da *permission denied*;
    - (c) `INSERT`/`UPDATE` fallan;
    - (d) las columnas de cada vista coinciden con un snapshot;
    - (e) lo oculto no aparece.
  - Cierra cuando: los tests están en verde en `pnpm verify`.
- [ ] **F10·4 Documento del contrato**
  - Qué hacer: escribir `docs/contrato-storefront-v1.md` (vistas, columnas, semántica, versionado y vectores de prueba de la firma de F11) y reemplazar `storefront/docs/integracion-tienda3d.md` por un link a él.
  - Cierra cuando: el storefront implementa F12 leyendo solo ese documento.

**Verificación:** verificación mínima de [t3d], incluidos los tests de contrato.

---

### F11 — Integración entre sistemas · 12–18 h

> **Objetivo:** que los dos sistemas se hablen de forma autenticada, firmada, idempotente y con
> reintentos (§5.5).

- [ ] **F11·1 [t3d] Clientes de integración**
  - Qué hacer:
    - Tabla `integration_clients` y guard `IntegrationAuthGuard` (Bearer, SHA-256, `timingSafeEqual`, alcances), con throttler propio.
    - Comando `pnpm integration:issue-key <nombre>` que imprime la clave una sola vez, y `integration:revoke`.
    - Rutas bajo `/api/integrations/storefront/v1`.
    - El proxy de `apps/web` devuelve 404 para `/api/integrations/*`.
  - Cierra cuando: sin clave da 401, con clave revocada da 401, con alcance insuficiente da 403, y por `sistema.localhost` da 404.
- [ ] **F11·2 [t3d][sf] Firma de eventos**
  - Qué hacer: funciones `signEvent` / `verifyEvent` en cada repo (formato de §5.5), con los mismos vectores de prueba del documento de contrato.
  - Cierra cuando: los dos repos pasan los mismos vectores.
- [ ] **F11·3 [t3d] Outbox y despacho**
  - Qué hacer:
    - Tabla `outbox_events`. La escritura del evento va en la misma transacción que el cambio.
    - Despachador con `@nestjs/schedule` cada 15 s, con backoff y `lastError`.
    - Alerta en el panel si un evento lleva más de 1 h sin entregarse.
  - Cierra cuando: con el storefront apagado, un `catalog.changed` queda pendiente y se entrega al prenderlo.
- [ ] **F11·4 [t3d] Recepción idempotente**
  - Qué hacer: tabla `inbound_events`. Los endpoints de §5.5 deduplican por `eventId` o `externalId`.
  - Cierra cuando: mandar dos veces el mismo evento produce un solo efecto (test).
- [ ] **F11·5 [sf] Endpoint de eventos y worker**
  - Qué hacer:
    - `src/app/api/internal/events/route.ts` (verifica firma y ventana, deduplica en `inbound_events`).
    - Worker `src/worker/index.ts` (mismo `Dockerfile`, comando `node dist/worker.js` o `pnpm worker`) con su outbox, el envío de mails pendientes y la limpieza de sesiones y tokens vencidos.
    - Servicio `storefront-worker` en el compose de infra.
  - Cierra cuando: con tienda3d apagado, un `customer.upserted` queda pendiente y se entrega al prenderlo; una firma inválida da 401.
- [ ] **F11·6 [sf] Revalidación del catálogo**
  - Qué hacer: `catalog.changed` → `revalidateTag(CATALOG_TAG | productTag(slug) | SETTINGS_TAG)`, con un `cacheLife` de respaldo de 5 minutos.
  - Cierra cuando: un cambio en el panel se ve en el sitio en menos de 5 s.

**Verificación:** verificación mínima de los dos repos, más una prueba manual con el ecosistema y un
contenedor apagado.

---

### F12 — El sitio lee el catálogo del sistema · 12–18 h

> **Objetivo:** que el storefront muestre solo lo que publica el sistema, sin catálogo ni panel
> propios (T2, T3).

- [ ] **F12·1 Cliente de lectura**
  - Qué hacer:
    - `src/server/catalog/reader.ts`, con un `pg.Pool` separado (`TIENDA3D_READER_URL` desde archivo y un máximo de 5 conexiones).
    - Consultas a las vistas con validación zod en el borde.
    - Mapeo a los tipos existentes (`ProductView`, `ProductCardView`, opciones y valores), donde miembros, colores y atributos se vuelven opciones.
  - Cierra cuando: hay tests unitarios del mapeo con filas de ejemplo (Trapecio y un cuaderno con atributos).
- [ ] **F12·2 Reemplazar las consultas**
  - Qué hacer: `server/catalog/queries.ts` y `server/settings.ts` pasan a leer las vistas, manteniendo `"use cache"` + `cacheTag` y leyendo primero los datos dinámicos (regla de Cache Components del `CLAUDE.md`).
  - Cierra cuando: `pnpm build` funciona sin base, y las páginas de tienda, categoría y producto muestran lo publicado.
- [ ] **F12·3 Fotos desde el volumen del sistema**
  - Qué hacer: `/media/[...path]` lee de `MEDIA_DIR` (montado `:ro`) con `Cache-Control` largo y `next/image` sobre esas rutas.
  - Cierra cuando: las fotos subidas en el panel se ven en el sitio.
- [ ] **F12·4 Redirecciones de slugs viejos**
  - Qué hacer: un slug que figura en `slug_redirects` responde 308 al nuevo.
  - Cierra cuando: cambiar el slug en el panel no rompe el link viejo.
- [ ] **F12·5 Sacar del storefront lo que pasó al sistema**
  - Qué hacer:
    - Borrar las rutas `/admin`, `server/actions/admin/*`, `server/admin/*`, `server/auth/session.ts` y los modelos `AdminUser`/`AdminSession`.
    - Borrar los modelos de catálogo y `StoreSettings`, el seed de catálogo y `scripts/import-woocommerce.ts`.
    - Hacerlo con una migración Prisma que borra las tablas, **sin reset**.
    - Redirigir `/admin/*` y `/wp-admin` a la home.
    - Actualizar el README y el `CLAUDE.md` del repo.
  - Cierra cuando: `grep -r "requireAdmin\|AdminUser" src` no devuelve nada, y typecheck, lint y tests están en verde.
- [ ] **F12·6 Carrito con variantes del sistema**
  - Qué hacer: las líneas guardan ids de `storefront_v1.variants`, y precio, disponibilidad y máximo salen de la vista (D3: precio de cantidad 1).
  - Cierra cuando: ocultar un producto en el panel lo saca del carrito con aviso ("ya no está disponible").

**Verificación:** verificación mínima de [sf], y e2e de catálogo y carrito adaptadas al ecosistema.
Publicar las 13 publicaciones migradas y comparar contra el sitio de hoy.

---

### F13 — Cuentas de cliente · 20–30 h

> **Objetivo:** que para comprar haya que tener una cuenta, y que la cuenta guarde todas las compras (T6).

- [ ] **F13·1 Modelo**
  - Qué hacer:
    - `Customer`: `id` uuid, `email` único normalizado, `passwordHash` (scrypt de `server/auth/password.ts`), nombre, apellido, teléfono, documento opcional, `emailVerifiedAt`, `failedLoginAttempts`, `lockedUntil`, `acceptedTermsAt`, `createdAt` y `lastLoginAt`.
    - `CustomerSession` (hash del token, vencimiento, último uso).
    - `CustomerEmailToken` (`VERIFY`/`RESET`, hash, vencimiento, `usedAt`).
    - `CustomerAddress`.
  - Cierra cuando: la migración aplica y hay tests del dominio de tokens.
- [ ] **F13·2 Registro y verificación de email (D5)**
  - Qué hacer:
    - `/mi-cuenta/registro` con aceptación de términos y privacidad.
    - Mail con link de un uso válido 24 h; `/mi-cuenta/verificar`.
    - Reenvío limitado a 3 por hora.
    - El registro no revela si el email ya existe ("Si el email no estaba registrado, te mandamos un link").
  - Cierra cuando: e2e de registro → mail en Mailpit → verificación.
- [ ] **F13·3 Ingreso y sesión**
  - Qué hacer:
    - `/mi-cuenta/ingresar`.
    - Cookie `tp_session`: `httpOnly`, `Secure` en producción, `SameSite=Lax`, 30 días con renovación por uso, token rotado al ingresar.
    - Bloqueo de 15 min tras 8 intentos fallidos (como tienda3d), más límite por IP y por email (`server/rate-limit.ts`).
    - Mensajes genéricos y `/mi-cuenta/salir`.
  - Cierra cuando: hay tests de bloqueo, rotación y vencimiento.
- [ ] **F13·4 Recuperar la contraseña**
  - Qué hacer: `/mi-cuenta/olvide-mi-clave` → link de 1 h → `/mi-cuenta/restablecer`, que cierra todas las sesiones.
  - Cierra cuando: un link usado o vencido no funciona (test).
- [ ] **F13·5 Mi cuenta**
  - Qué hacer:
    - `/mi-cuenta` (resumen), `/mi-cuenta/compras` (lista), `/mi-cuenta/compras/[numero]` (detalle con estados, seguimiento e historial), `/mi-cuenta/datos`, `/mi-cuenta/direcciones` y cambio de contraseña (cierra las otras sesiones).
    - Quitar la redirección heredada `/mi-cuenta/* → /tienda/` de `next.config.ts`: se reusa la URL que tenía WordPress.
    - Proteger `/mi-cuenta/*` en `src/proxy.ts`.
  - Cierra cuando: un cliente ve solo sus compras; pedir la de otro devuelve 404.
- [ ] **F13·6 El checkout exige sesión**
  - Qué hacer:
    - Sin sesión, `/finalizar-compra` lleva a `/mi-cuenta/ingresar?volver=/finalizar-compra` (con link a registro). El carrito sigue en la cookie.
    - Con sesión pero sin email verificado, pide verificar.
    - Prellenar con los datos y las direcciones.
  - Cierra cuando: e2e muestra que sin cuenta no se puede comprar y que el carrito sobrevive al ingreso.
- [ ] **F13·7 Privacidad (Ley 25.326)**
  - Qué hacer: página de política de privacidad (texto a acordar con la dueña), consentimiento registrado y "Pedir la baja de mi cuenta" (en v1, por mail a la tienda).
  - Cierra cuando: la página está publicada y enlazada en el registro y en el footer.
- [ ] **F13·8 Aviso al sistema**
  - Qué hacer: `customer.upserted` por outbox al registrarse y al cambiar datos (solo nombre, email, teléfono y documento).
  - Cierra cuando: el cliente aparece en `web_customers` de tienda3d (después de F14·2).

**Verificación:** verificación mínima de [sf] y e2e de cuentas.

---

### F14 — Pedidos de punta a punta · 30–45 h

> **Objetivo:** que el sitio guarde cada compra, el sistema la registre y el admin la gestione, y que
> el cliente vea cada cambio (T4).

- [ ] **F14·1 [sf] Pedido con dos ejes de estado**
  - Qué hacer:
    - Migración de `Order`: `customerId` obligatorio, `paymentStatus` + `fulfillmentStatus` (§5.6) en lugar de `status`, y `systemCode`.
    - `OrderItem` con snapshot: `webVariantId`, `sku`, `systemProductId`, nombre, etiqueta de la variante, colores elegidos `{línea: {id, nombre, hex}}`, atributos y precio unitario.
    - Portar `domain/orders.ts` a los dos ejes.
  - Cierra cuando: hay tests de dominio de las transiciones de cada eje.
- [ ] **F14·2 [t3d] Modelo de pedidos web**
  - Qué hacer:
    - `WebCustomer` (D4), `WebOrder`, `WebOrderItem` (con `webVariantId`, `productId`, `colorSelections` y `productionOrderId?`) y `WebOrderEvent`.
    - Código `W-AAAA-NNNN` con `DocumentCodeService` (scope `WEB_ORDER:W`), usando el año de Argentina.
  - Cierra cuando: la migración aplica y hay un test del código correlativo.
- [ ] **F14·3 Registro del pedido (D2)**
  - Qué hacer:
    - [t3d] `POST /orders` es idempotente por `externalId`:
      - valida cada línea contra `web_prices` (si un precio cambió, 409 con los precios nuevos) y la disponibilidad;
      - reserva stock de las variantes con stock (`updateMany` con guarda `stockQuantity >= qty`), todo en una transacción;
      - devuelve el código.
    - [sf] El checkout crea el pedido en estado borrador, llama al sistema y lo confirma con el código. Si el sistema falla o rechaza, no hay pedido: se le explica al cliente y el carrito queda igual.
  - Cierra cuando:
    - repetir la llamada no duplica;
    - dos compras simultáneas de la última unidad dejan una sola aprobada (test de concurrencia);
    - un cambio de precio en medio del checkout muestra el precio nuevo.
- [ ] **F14·4 [sf] Pago provisorio (D7)**
  - Qué hacer: la transferencia muestra las instrucciones de los ajustes y deja el pedido en `AWAITING_TRANSFER`. El pago simulado solo existe en local (ya validado en `env.ts`).
  - Cierra cuando: e2e completa con transferencia en el ecosistema.
- [ ] **F14·5 [t3d] Panel de pedidos web**
  - Qué hacer:
    - `/tienda-online/pedidos`: lista con filtros (estado, pago, fecha, entrega) y contador de nuevos en el menú.
    - `/tienda-online/pedidos/[id]`: cliente, entrega, ítems con colores (swatches) y atributos, pago, historial y notas internas.
    - Acciones: confirmar transferencia, preparar, listo para retirar, enviado (con seguimiento), entregado y cancelar (pide motivo y libera stock).
  - Cierra cuando: cada acción respeta §5.6 (tests de API) y queda en auditoría.
- [ ] **F14·6 Estados de vuelta al sitio**
  - Qué hacer:
    - [t3d] Emitir `order.fulfillment_changed` y `order.payment_confirmed_manually` por outbox.
    - [sf] Aplicarlos, sumarlos al historial y mandar el mail correspondiente.
  - Cierra cuando: un cambio en el panel se ve en "Mis compras" en menos de 30 s, con el mail en Mailpit.
- [ ] **F14·7 [t3d] Orden de producción desde un ítem**
  - Qué hacer: botón "Generar orden de producción" en el ítem, que precarga producto, cantidad y `filamentOverrides`, armados con las piezas de cada opción de color y el color elegido. Vincula el ítem con la orden. Requiere F2·3 y F2·5.
  - Cierra cuando: la orden generada para una Trapecio Marrón 280 tiene el color Marrón en todas sus piezas de PLA.
- [ ] **F14·8 [t3d] Clientes web**
  - Qué hacer: `/tienda-online/clientes` con lista y detalle (sus pedidos).
  - Cierra cuando: un cliente con dos compras las muestra a las dos.
- [ ] **F14·9 [sf] Mails del pedido**
  - Qué hacer: portar y ajustar `server/mail/templates.ts` (pedido recibido con instrucciones de transferencia, pago confirmado, cada cambio de preparación y cancelación) y el aviso de pedido nuevo a `notification_email`.
  - Cierra cuando: e2e encuentra los mails en Mailpit con el número y el código correctos.

**Verificación:** verificación mínima de los dos repos. E2e del ecosistema: compra → panel → confirmar
transferencia → preparar → listo → cliente ve los estados y recibe 4 mails. Cancelar libera stock.

---

### F15 — Solicitudes de personalización · 8–12 h

> **Objetivo:** que las solicitudes del formulario "Personalización" lleguen al sistema y se puedan
> convertir en una cotización a medida.

- [ ] **F15·1 [sf] Guardar y avisar**
  - Qué hacer: el formulario actual guarda la solicitud y su adjunto en `sf-private` y crea un evento `quote_request.created` en el outbox. El worker lo entrega como multipart, y al confirmarse la entrega se borra el adjunto local.
  - Cierra cuando: con tienda3d apagado, la solicitud llega al prenderlo.
- [ ] **F15·2 [t3d] Recepción**
  - Qué hacer: `WebQuoteRequest`, con el adjunto en `t3d-private` (mismas validaciones que en `domain/quotes.ts`: extensiones y 20 MB) y deduplicación por id.
  - Cierra cuando: hay tests de duplicado y de adjunto inválido.
- [ ] **F15·3 [t3d] Panel**
  - Qué hacer: `/tienda-online/solicitudes` (lista, estado, nota y descarga del adjunto con `ecommerce:orders`) y el botón **"Crear cotización a medida"**, que abre `/cotizaciones/nueva-a-medida` con el nombre, el contacto y la idea precargados.
  - Cierra cuando: de una solicitud sale una cotización `R-AAAA-NNNN` vinculada.

**Verificación:** e2e del formulario hasta el panel.

---

### F16 — Prueba integral local y decisión · 12–18 h

> **Objetivo:** demostrar que el ecosistema funciona completo y seguro en local, y tener los datos
> para decidir el despliegue.

- [ ] **F16·1 E2e del ecosistema**
  - Qué hacer: suite Playwright en [infra] (o en [sf] con una URL configurable) contra el perfil de producción:
    - catálogo: publicar, ocultar y cambiar precio;
    - cuentas;
    - compra completa;
    - panel;
    - solicitud de personalización;
    - caídas: tienda3d apagado durante el checkout (mensaje claro) y storefront apagado durante un cambio de estado (llega al volver).
  - Cierra cuando: la suite está en verde dos veces seguidas desde un ecosistema limpio.
- [ ] **F16·2 Seguridad**
  - Qué hacer:
    - Tests de contrato del lector (F10·3).
    - `docker inspect` sin secretos y solo Caddy con puertos publicados.
    - `/api/internal/*` y `/api/integrations/*` inaccesibles desde afuera.
    - Cabeceras.
    - **OWASP ZAP baseline** (gratuito) contra `tienda.localhost` y `sistema.localhost`.
    - gitleaks en los tres repos.
  - Cierra cuando: ZAP no tiene alertas *High* y las *Medium* están resueltas o justificadas.
- [ ] **F16·3 Simulacro de desastre**
  - Qué hacer: backup → borrar volúmenes → restaurar (F3·7). Medir el tiempo.
  - Cierra cuando: la restauración funciona y el tiempo queda en la bitácora.
- [ ] **F16·4 Medición de recursos**
  - Qué hacer: `docker stats` en reposo y con una carga simple (k6 o autocannon: 20 usuarios navegando y 2 compras por minuto durante 10 min).
  - Cierra cuando: hay RAM y CPU pico por servicio, con una recomendación de tamaño de EC2 y arquitectura (D11).
- [ ] **F16·5 Decisión de despliegue**
  - Qué hacer: checklist con las e2e en verde, seguridad, restauración, la estimación de costo mensual con los tamaños medidos y los pendientes conocidos.
  - Cierra cuando: la decisión ("sí" / "todavía no" y por qué) está en la bitácora.

---

### F17 — Despliegue en EC2 · 16–24 h (solo si F16 da "sí")

- [ ] **F17·1 Infraestructura AWS**
  - Qué hacer:
    - EC2 del tamaño de F16·4, con EBS gp3 cifrado y Elastic IP.
    - Security Group con solo 80/443. **Sin SSH**: acceso por **SSM Session Manager**.
    - Rol IAM con `ssm:GetParametersByPath` sobre `/tienda-plastik/prod/*`, `kms:Decrypt` (vía SSM) y `s3:PutObject` en el bucket de backups.
    - Todo documentado (idealmente con Terraform o, como mínimo, con los pasos en `docs/aws.md`).
  - Cierra cuando: se entra a la instancia por Session Manager sin ningún puerto 22 abierto.
- [ ] **F17·2 Sistema base**
  - Qué hacer: Docker Engine con el plugin compose, actualizaciones de seguridad automáticas, zona horaria de Argentina, rotación de logs y usuario sin root para el despliegue.
  - Cierra cuando: `docker compose version` funciona y las actualizaciones automáticas están activas.
- [ ] **F17·3 Secretos de producción**
  - Qué hacer: cargar los parámetros `SecureString` (§5.8) y crear `fetch-secrets.service` (systemd, oneshot, antes de compose), que escribe en tmpfs.
  - Cierra cuando: después de un reboot los secretos están en `/run/tienda-plastik/secrets` y no hay ninguno en el disco.
- [ ] **F17·4 Imágenes**
  - Qué hacer: **sin GitHub Actions**. Build desde la máquina de desarrollo con `docker buildx build --platform <D11> --push` hacia GHCR privado (tags inmutables por commit), o build en la instancia. Decidir y documentar en `scripts/release.sh`.
  - Cierra cuando: un despliegue es `docker compose pull && docker compose up -d` con versión conocida, y se puede volver a la anterior.
- [ ] **F17·5 Dominios y TLS**
  - Qué hacer:
    - Caddy con Let's Encrypt para `sistema.tiendaplastik.com` (protegido según D8).
    - El sitio se publica primero en un subdominio de prueba (por ejemplo `nueva.tiendaplastik.com`) hasta F20.
    - Mails con SPF, DKIM y DMARC del dominio (D10).
  - Cierra cuando: SSL Labs da A, y los mails de prueba llegan sin caer en spam.
- [ ] **F17·6 Backups y monitoreo**
  - Qué hacer:
    - Cron de `scripts/backup.sh` a S3 cifrado, con ciclo de vida de 30 días diarios y 12 mensuales.
    - Snapshots de EBS con Data Lifecycle Manager.
    - Monitor de disponibilidad externo gratuito con aviso por mail, y alarmas de CPU y disco.
  - Cierra cuando: se restaura un backup de S3 en un ecosistema local.

### F18 — Base en RDS · 6–10 h (largo plazo)

- [ ] **F18·1** Crear RDS PostgreSQL 16 en subred privada, cifrada, con backups automáticos, `rds.force_ssl=1` y Security Group solo desde la EC2.
- [ ] **F18·2** Correr `db/init/00-roles.sh` contra RDS con el usuario *master*; no requiere superusuario (§5.3).
- [ ] **F18·3** Ventana de corte: modo mantenimiento, `pg_dump` de las dos bases, `pg_restore`, URLs nuevas en SSM (`sslmode=verify-full` con el bundle de AWS), reinicio y verificación. Después, quitar el servicio `db` del compose.
- [ ] Cierra cuando: las e2e de F16·1 pasan contra RDS y el backup automático de RDS está verificado.

### F19 — Mercado Pago · 10–16 h

- [ ] **F19·1** Cargar las credenciales en SSM (`mp_access_token`, `mp_webhook_secret`) y poner `PAYMENTS_PROVIDER=mercadopago`.
- [ ] **F19·2** Configurar el webhook `https://<dominio>/api/webhooks/mercadopago`. La firma ya está implementada en `server/payments/mercadopago-rules.ts`. Al aprobarse el pago: `paymentStatus = APPROVED` y `payment_updated` al sistema.
- [ ] **F19·3** Rechazos, reintento de pago, reembolsos y contracargos (`REFUNDED`).
- [ ] **F19·4** Pruebas con usuarios de prueba de MP y checklist de salida (descriptor de tarjeta, URLs de retorno, control de monto e idempotencia).
- [ ] Cierra cuando: un pago de prueba real (monto mínimo) se aprueba, se ve en el panel y se reembolsa.

### F20 — Lanzamiento y baja del WordPress · 6–10 h

- [ ] **F20·1** Congelar cambios en WooCommerce y repetir F9 con los datos del día.
- [ ] **F20·2** Pasar el DNS de `tiendaplastik.com` a la EC2. Verificar las redirecciones heredadas (`/mi-cuenta/`, `/shop/`, `/etiqueta-producto/`…), Search Console y el sitemap.
- [ ] **F20·3** Exportar los pedidos y clientes históricos de WooCommerce como registro (no se migran a cuentas).
- [ ] **F20·4** Apagar el WordPress de Hostinger después de 30 días sin incidentes, con un backup final guardado.
- [ ] Cierra cuando: el sitio público es el storefront y no hay errores 404 en Search Console por URLs viejas.

---

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Los precios de la web cambian al pasar a Venta Directa (redondeo hacia arriba a 50 y markups actuales). | La dueña ve precios distintos a los de hoy. | Reporte F9·3 antes de publicar; los ajustes se hacen en markups o categorías del sistema. |
| El sistema tiene 1 solo color de filamento cargado. | No se puede publicar nada con colores. | F9·1 antes de F9·2. |
| F-30 no tiene una solución conocida todavía. | Sin imagen de producción de la web no hay prueba integral ni EC2. | F2·1 es lo primero de F2; si se traba, construir la web del sistema con `next start` sobre el build completo como plan B. |
| El checkout depende de que tienda3d responda (D2). | Si el sistema se cae, no se vende. | Los dos corren en el mismo host; mensaje claro y monitoreo en F17·6. |
| Datos personales en dos bases (sitio y copia en el sistema). | Más superficie ante una filtración. | Copia mínima (D4), backups cifrados y sin datos de clientes en la base del sistema más allá de lo necesario para gestionar. |
| El panel de gestión pasa de estar solo en el taller a estar en internet. | Más exposición. | D8 (capa extra gratuita), bloqueo por intentos y cookies `Secure`. |
| Tamaño del trabajo (≈200–300 h en local). | Mucho tiempo sin nada utilizable. | Fases con valor propio: al terminar F12, el catálogo ya sale del sistema; F13–F15 se pueden priorizar. |
| Una sola instancia (límites, sesiones y crons en memoria o en la base). | No escala horizontalmente. | Aceptado para este volumen; si hace falta, Redis para límites y *leader election* para crons. |
| Next 16.0.0 en tienda3d y 16.4.x en el storefront. | Diferencias de comportamiento entre los dos. | Opcional: alinear versiones en F2. |

---

## 8. Fuera de alcance

- **Portal B2B de tienda3d** (`customer-portal.md`, 7.A–7.D). El módulo de pedidos web podría reutilizarse más adelante.
- Cotización en línea de envíos con Correo Argentino: sigue la tarifa fija o "a coordinar" de los ajustes.
- Producción automática al pagar y stock terminado que se carga solo al cerrar una orden de producción (D9).
- Integraciones reales con MercadoLibre, ARCA y WhatsApp, y facturación electrónica.
- Alta disponibilidad o más de una instancia.
- Migrar los pedidos y cuentas históricos de WooCommerce a cuentas nuevas (F20·3 solo los exporta).
- Los bugs de stock de insumos que no afectan este flujo (signo del ajuste manual, `PATCH` de `currentStock` sin movimiento): quedan para un plan propio.

---

## 9. Bitácora

| Fecha | Fase | Nota |
| --- | --- | --- |
| 2026-10-26 | — | Plan creado a partir del relevamiento de los dos sistemas y la base local en uso. Decisiones T1–T11 de Pablo; D1–D12 propuestas, a confirmar en F0·3. |
