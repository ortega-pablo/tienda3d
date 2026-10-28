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
3. [Decisiones](#3-decisiones)
4. [Relevamiento](#4-relevamiento)
5. [Arquitectura objetivo](#5-arquitectura-objetivo)
6. [Fases](#6-fases)
7. [Riesgos](#7-riesgos)
8. [Fuera de alcance](#8-fuera-de-alcance)
9. [Bitácora](#9-bitácora)

---

## 0. Convenciones

| Ítem                    | Convención                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDs                     | `F<fase>·<n>` (por ejemplo `F5·3`). No se reutilizan: una tarea descartada se tacha con su motivo.                                                                                                                                                                                          |
| Repos                   | **[t3d]** = `tienda3d` · **[sf]** = `tienda-plastik-page` (código en `storefront/`) · **[infra]** = repo nuevo `tienda-plastik-infra` (D1).                                                                                                                                                 |
| Rutas                   | Relativas a la raíz de cada repo. En [sf], relativas a `storefront/`.                                                                                                                                                                                                                       |
| Ramas                   | `feat/<id>-<slug>` (por ejemplo `feat/f5-3-colores`) desde la rama por defecto de cada repo: `unificacion` en [t3d] y [sf] mientras dure la unificación, `main` en [infra]. Cada tarea entra por un PR que la cierra (ver el tablero, `.claude/tablero.md`).                                |
| Commits                 | Estilo de cada repo: [t3d] `feat(scope): …`; [sf] mensaje en español. Incluir el ID: `Cierra F5·3.`                                                                                                                                                                                         |
| Verificación mínima     | [t3d] `pnpm typecheck && pnpm test && pnpm test:int` · [sf] `pnpm typecheck && pnpm lint && pnpm test` (+ `pnpm test:e2e` donde se indique).                                                                                                                                                |
| Verificación automática | **Sin GitHub Actions.** Corre en hooks locales con lefthook: `pre-commit` (gitleaks sobre lo que se commitea + formato y lint de los archivos tocados) y `pre-push` (typecheck + tests unitarios). `pnpm verify` corre todo, integración incluida, y es obligatorio antes de mergear un PR. |
| Estimaciones            | Rangos en horas **propuestos**, incluyen definir cómo se hace. Confirmarlos o corregirlos antes de arrancar cada fase.                                                                                                                                                                      |
| Base de datos           | Nunca resetear una base con datos sin preguntar. Cambios de esquema siempre por migración.                                                                                                                                                                                                  |

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

| ID  | Decisión                                                                                                                                                                                  | Consecuencia en el plan                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| T1  | El panel del ecommerce vive en tienda3d y es para el rol **`admin` existente**. No se crean roles ni usuarios nuevos.                                                                     | Permisos `ecommerce:*` solo para `admin` (F4).                                                                      |
| T2  | Toda la información de productos sale de **una sola base: la de tienda3d**.                                                                                                               | El storefront deja de tener catálogo propio (F12).                                                                  |
| T3  | El sitio lee el catálogo con un **usuario de solo lectura** limitado a lo que necesita.                                                                                                   | Esquema `storefront_v1` con vistas + rol `storefront_reader` (F10).                                                 |
| T4  | El sitio **guarda los datos de cada compra** en su base y **notifica al sistema**, que registra los pedidos que entran por la tienda.                                                     | El storefront conserva una base propia (clientes y pedidos) con escritura solo ahí; integración por API (F11, F14). |
| T5  | El **precio publicado** es el **precio de Venta Directa a cliente normal**.                                                                                                               | Proyección automática del precio (F7). Sin precios cargados a mano.                                                 |
| T6  | Para comprar hay que **crear una cuenta o iniciar sesión** como cliente normal. Sin cuenta no se compra. La cuenta guarda todas las compras.                                              | Cuentas de cliente en el storefront (F13).                                                                          |
| T7  | Un **producto web** puede agrupar **más de un producto del sistema** para indicar sus variantes.                                                                                          | Modelo "publicación" con miembros (F5).                                                                             |
| T8  | Los **colores** de cada producto web se eligen de los colores de filamento que existen en el sistema **para el filamento que usa**: la web puede mostrar 2 aunque se pueda imprimir en 5. | Opción de color por línea de filamento con subconjunto elegido (F5·3).                                              |
| T9  | Las **imágenes** se guardan en un **volumen Docker**, también en producción.                                                                                                              | Almacenamiento en disco con puerto intercambiable (F6).                                                             |
| T10 | Destino: **EC2 con Docker**; a largo plazo **RDS**. Primero, probar todo en local.                                                                                                        | F3 replica la topología de producción en local; F17–F18 son evaluación.                                             |
| T11 | **Mercado Pago** se conecta más adelante. Los secretos tienen que seguir **los mejores estándares**, con herramientas **gratuitas**.                                                      | F1 y §5.8; MP queda en F19.                                                                                         |

**Cómo se aplica T6 (con D4):** "usuario de cliente normal" es una **cuenta de cliente del sitio**,
no un usuario del sistema de gestión, así que no se incorporan usuarios a tienda3d (T1). El sistema
registra a cada comprador como **cliente** (`Customer` tipo `STANDARD`, origen web).

---

## 3. Decisiones

Definidas por Pablo el 2026-10-27. Las tareas del plan ya están escritas con estas respuestas.

| ID  | Pregunta                                                                                                        | Definición                                                                                                                                                                                                                                                                                                                                                                                                    | Tareas afectadas         |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| D1  | ¿Dónde vive la orquestación del ecosistema (compose conjunto, Caddy, scripts de secretos, backup y despliegue)? | Repo nuevo **`ortega-pablo/tienda-plastik-infra`** (privado) en la carpeta madre. Los dos repos de apps siguen independientes.                                                                                                                                                                                                                                                                                | F1, F3, F16, F17         |
| D2  | ¿Cuándo registra el sitio cada pedido en el sistema?                                                            | **En el momento de comprar**: llamada a la API con idempotencia; el sistema valida el precio y reserva stock. Si no responde, el sitio no toma el pedido y lo avisa. Los cambios siguientes viajan como eventos con reintento.                                                                                                                                                                                | F14·3                    |
| D3  | ¿La web aplica las escalas de Venta Directa por cantidad?                                                       | **No**: precio unitario de cantidad 1 para cualquier cantidad.                                                                                                                                                                                                                                                                                                                                                | F7, F12·6, F14·3         |
| D4  | ¿Cómo ve el sistema a los compradores de la web?                                                                | **Como clientes del sistema**: `Customer` tipo `STANDARD`, con `source = WEB` y `externalId` = id de la cuenta del sitio. Aparecen en Clientes junto a los B2B, con un filtro por origen. Si el email ya es de un cliente existente, los pedidos web se vinculan a ese cliente en lugar de crear otro. **El precio web es siempre el publicado**: nunca se aplican los flags ni el markup propio del cliente. | F13·8, F14·2, F14·8, F15 |
| D5  | ¿Hay que verificar el email antes de comprar?                                                                   | **Sí**: link de un solo uso válido 24 h.                                                                                                                                                                                                                                                                                                                                                                      | F13·2, F13·6             |
| D6  | ¿Se permiten opciones informativas sin producto del sistema detrás ("Tipo de hoja: Cuadro/Punto")?              | **Sí**, sin impacto en el precio.                                                                                                                                                                                                                                                                                                                                                                             | F5·4, F9·2               |
| D7  | ¿Cómo se paga hasta que esté Mercado Pago?                                                                      | **Transferencia** con confirmación manual del admin en el panel. En local, además, el pago **simulado**.                                                                                                                                                                                                                                                                                                      | F14·4                    |
| D9  | ¿Cómo se maneja el stock de la tienda?                                                                          | **Por variante**: a pedido (con plazo y máximo por compra) o stock de producto terminado cargado a mano, que la compra descuenta. La orden de producción se genera a mano desde el pedido.                                                                                                                                                                                                                    | F5·5, F14·3              |
| D10 | ¿Quién manda los mails?                                                                                         | **Solo el sitio**. El sistema avisa los cambios al sitio y el sitio escribe al cliente. El proveedor de producción se elige en F17.                                                                                                                                                                                                                                                                           | F13, F14·9               |
| D13 | ¿Las categorías de la tienda van aparte de las del sistema (que definen el markup)?                             | **Aparte**: categorías de la tienda propias; un producto web puede estar en varias.                                                                                                                                                                                                                                                                                                                           | F5·6, F8·5               |
| D14 | ¿Un producto del sistema puede estar en más de una publicación web?                                             | **No**, en una sola.                                                                                                                                                                                                                                                                                                                                                                                          | F5·2                     |
| D15 | ¿Cómo se arma el SKU de cada variante web?                                                                      | **`PTK-PROD-NNNNNN-VNN`**: el SKU del producto del sistema más un sufijo de variante. El SKU de WooCommerce se guarda como referencia (`legacySku`).                                                                                                                                                                                                                                                          | F5·5, F9·2               |
| D16 | ¿Las solicitudes de personalización piden cuenta?                                                               | **Sí**: se envían desde la cuenta del cliente, quedan vinculadas a su `Customer` en el sistema y el cliente ve su estado en Mi cuenta.                                                                                                                                                                                                                                                                        | F15                      |
| D17 | ¿Dónde se guardan los secretos en EC2?                                                                          | **AWS Systems Manager Parameter Store** (`SecureString` estándar), leídos con el rol IAM de la instancia hacia tmpfs.                                                                                                                                                                                                                                                                                         | F17·3                    |

**Siguen abiertas** (no bloquean empezar):

| ID  | Pregunta                                               | Propuesta                                                                                                                                                                                                                                                                                                                                                                                   | Se define en                      |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| D8  | En EC2, ¿el panel de gestión queda abierto a internet? | Con una capa extra gratuita: Cloudflare Access o Tailscale.                                                                                                                                                                                                                                                                                                                                 | F17                               |
| D11 | ¿EC2 ARM (Graviton) o x86?                             | Según las mediciones de F16·4. ARM es más barato; `argon2` y `sharp` tienen binarios para arm64, pero las imágenes hay que construirlas para esa arquitectura.                                                                                                                                                                                                                              | F16·4                             |
| D12 | Conciliación del catálogo actual con la dueña (§4.8).  | **Definida 2026-10-28** ([anexo](anexos/F0-5-conciliacion-catalogo.md)): los colores se amplían en el sistema y la tienda solo ofrece los que existen ahí; precios OK; los productos nuevos los publica la dueña desde el sistema; las diferencias (TPK/PTK, Noche/Día, Riso, 380/390) se concilian al final contra un dump de la base real, porque la de este equipo no es la del sistema. | F9·1–F9·2 en local; F9·3 al final |

---

## 4. Relevamiento

Relevamiento del 2026-10-26 sobre el código de los dos repos y la base local en uso de tienda3d.

### 4.1 Mapa actual

|            | tienda3d (sistema de gestión)                                                                                                                                                                                                  | storefront (sitio web)                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Repo       | `ortega-pablo/tienda3d` (privado)                                                                                                                                                                                              | `ortega-pablo/tienda-plastik-page` (privado), código en `storefront/`                                  |
| Stack      | Next.js 16.0.0 + React 19 (web) · NestJS 11 + Prisma 6.19.3 + Zod (API) · PostgreSQL 16 · monorepo pnpm (`apps/api`, `apps/web`, `packages/shared`)                                                                            | Next.js 16.4.3 (App Router, Cache Components, Server Actions) · Prisma 7 + PostgreSQL 16 · Tailwind v4 |
| Corre      | Docker Compose local en el taller: web `:3000`, API `:3001`, Postgres `:5432`                                                                                                                                                  | Docker Compose: tienda `:3100`, Postgres `:5442`, Mailpit `:8026`                                      |
| Rama       | `fix/auditoria-correcciones`: 1 commit adelante de su remoto, 69 sobre `main` (que tiene 8 commits; la base real es `develop`). Rename sin commitear de `docs/FUNCIONALIDADES.md` → `docs/funcionalidades-sistema-gestion.md`. | `main` = `origin/main` (756f467), limpio. Tag `wordpress-final` con el WordPress.                      |
| Tests      | ~121 unitarios (12 archivos) · ~20 de integración contra Postgres real (5 archivos) · sin e2e · **sin CI**                                                                                                                     | 61 unitarios (Vitest) · 18 e2e (Playwright, escritorio + celular) · sin CI                             |
| Producción | No tiene: corre en la PC del taller                                                                                                                                                                                            | No tiene: el sitio público sigue siendo el WordPress en Hostinger                                      |

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

| Dato                                 | Valor                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Migraciones aplicadas                | hasta `20260821030000_one_current_price_per_material`                                        |
| Productos                            | 38, todos activos, **todos con piezas de "PLA Genérico"**                                    |
| Líneas de filamento                  | 2: "PLA Genérico", "ABS genérico"                                                            |
| **Colores de filamento**             | **1**: "PLA Genérico · Blanco" `#FFFFFF`                                                     |
| Insumos                              | 3 FILAMENT · 9 HARDWARE · 4 OTHER · 2 SHEET · 1 PACKAGING (todos con stock 0)                |
| Cotizaciones / órdenes de producción | 10 / 0                                                                                       |
| Usuarios                             | 2 (1 `admin`, 1 `operator`) · Clientes B2B: 6                                                |
| Canales                              | `directa` DIRECT_SALE · `mercadolibre` MARKETPLACE · `efectivo` CASH, todos `SIMPLE` sin IVA |
| Venta Directa deshabilitada          | en 0 productos                                                                               |

En la raíz del repo hay un volcado `tienda3d_dump_2026-07-22.sql`. Está ignorado por git y nunca se
commiteó, pero **contiene usuarios, tokens de refresco y clientes** (F0·2).

### 4.7 storefront — estado actual

**Qué hace hoy:**

- Clon del sitio con las mismas URLs que WordPress.
- Catálogo propio con variantes y stock, carrito en cookie (`tp_cart`), checkout como invitado y pagos (puerto con proveedor simulado y Mercado Pago Checkout Pro, listo pero sin credenciales).
- Pedidos, cotizaciones a medida con adjunto, mails con Nodemailer, y panel `/admin` con sesión propia.

| Pieza                                                                                                                                                                    | Destino en el plan                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Páginas públicas, diseño, `src/content/`, SEO, carrito en cookie, `domain/cart.ts`, `domain/money.ts`, `domain/rich-text.ts`, `domain/checkout.ts`, `domain/shipping.ts` | **Se quedan.**                                                                         |
| `domain/catalog.ts` (ProductView, disponibilidad, selección de variantes)                                                                                                | **Se queda**, alimentado por las vistas del sistema (F12·1).                           |
| `domain/variants.ts` (`planVariants`)                                                                                                                                    | **Se porta a tienda3d** (F5·5).                                                        |
| `domain/orders.ts` (estados y transiciones)                                                                                                                              | **Se divide**: pago en el sitio, preparación en el sistema (§5.6).                     |
| Modelos Prisma de catálogo (`Category`, `Product*`, `Variant*`), `StoreSettings`, seed de catálogo, `scripts/import-woocommerce.ts`                                      | **Se van** (F12·5). `prisma/seed/catalog.json` + `media/` alimentan la migración (F9). |
| Panel `/admin`, `AdminUser`, `AdminSession`, `server/actions/admin/*`, `server/admin/*`                                                                                  | **Se van** (F12·5); se rehacen en tienda3d (F8, F14·5, F15).                           |
| `Order`, `OrderItem`, `Payment`, `PaymentNotification`, `OrderEvent`, `QuoteRequest`                                                                                     | **Se quedan y cambian** (F14, F15).                                                    |
| `server/payments/*` (gateway, MP, simulado, reglas y firma de webhook)                                                                                                   | **Se queda**; MP se activa en F19.                                                     |
| `server/mail/*`                                                                                                                                                          | **Se queda y crece** (cuentas y estados).                                              |
| `server/storage.ts` + `/media/[...path]`                                                                                                                                 | **Se queda**, lee el volumen del sistema en solo lectura (F12·3).                      |
| `server/rate-limit.ts` (en memoria)                                                                                                                                      | **Se queda** (una sola instancia).                                                     |

**Variables actuales** (`src/server/env.ts`): `NODE_ENV`, `DATABASE_URL`, `SITE_URL`,
`UPLOADS_DIR`, `PAYMENTS_PROVIDER`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`,
`MP_STATEMENT_DESCRIPTOR`, `SMTP_URL`, `MAIL_FROM`, más `ADMIN_EMAIL`/`ADMIN_PASSWORD` del seed.

### 4.8 Correspondencia de catálogos (web hoy ↔ sistema)

| Producto web                          | Opciones web                         | SKU web                  | Producto(s) del sistema                     | Estado                                                          |
| ------------------------------------- | ------------------------------------ | ------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| Cuaderno Plastik A5 – Army            | Tipo de hoja                         | PTK-PROD-000026          | Cuaderno A5 — Army                          | ok                                                              |
| Cuaderno Plastik A5 – DEV             | Tipo de hoja                         | PTK-PROD-000019          | Cuaderno A5 — DEV                           | ok                                                              |
| Cuaderno Plastik A5 – Edición Arirang | Color (Blanco, Negro) × Tipo de hoja | PTK-PROD-000017          | Cuaderno A5 — Arirang BTS                   | ok                                                              |
| Cuaderno Plastik A5 – Monocromático   | Tipo de hoja × Color (7)             | **TPK**-PROD-000001      | PTK-PROD-000001 Cuaderno A5 — Monocromático | **error de tipeo en la web**                                    |
| Cuaderno Plastik A5 – Noche / Día     | Tipo de hoja                         | TPK-PROD-27              | —                                           | **no existe en el sistema** (PTK-PROD-000027 es el Cuaderno A4) |
| Cuaderno Plastik A5 – Riso            | Tipo de hoja                         | PTK-PROD-27              | —                                           | **no existe en el sistema**                                     |
| Lámpara Lana — Mesa                   | Color (Negro)                        | PTK-PROD-000006          | Lana                                        | ok                                                              |
| Lámpara Lia — Colgante                | Color (Blanco, Negro)                | PTK-PROD-000025          | Lámpara Lia — Colgante                      | ok                                                              |
| Lámpara Lina — Mesa                   | Color (4)                            | PTK-PROD-000005          | Lina                                        | ok                                                              |
| Lámpara Mila — Colgante               | Color (3)                            | PTK-PROD-000009          | Mila                                        | ok                                                              |
| Lámpara Nala — Colgante               | Color (3)                            | PTK-PROD-000010          | Nala                                        | ok                                                              |
| Lámpara Trapecio — Mesa               | Color (4) × Tamaño (280, **380**)    | PTK-PROD-000003, -000004 | Trapecio 280, Trapecio **390**              | **380 vs 390**                                                  |
| Lámpara Vera — Mesa                   | Color (5)                            | PTK-PROD-000002          | Vera R                                      | ok                                                              |

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

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                            | Severidad         | Se resuelve en   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------- |
| S1  | Escaneo del **historial completo** con gitleaks: no hay secretos propios en ningún repo. En [t3d] hay 2 falsos positivos (datos de prueba en `apps/api/src/common/config/validate-secrets.spec.ts`). En [sf], los únicos hallazgos están en código de plugins de WordPress de terceros (commit `a23354bc`, hoy solo en el historial y en el tag `wordpress-final`). | Info              | F1·4 (allowlist) |
| S2  | `.env` local de [t3d] con `POSTGRES_PASSWORD` igual al valor de ejemplo y `SEED_ADMIN_PASSWORD=admin123` (F-23 parcial).                                                                                                                                                                                                                                            | Alta              | F1·5             |
| S3  | `API_NODE_ENV` local no es `production`, así que las cookies del sistema salen sin `Secure`.                                                                                                                                                                                                                                                                        | Media (local)     | F3·6, F17        |
| S4  | Volcado de la base con usuarios, tokens y clientes en la raíz del repo de [t3d].                                                                                                                                                                                                                                                                                    | Media             | F0·2             |
| S5  | Los secretos se pasan como **variables de entorno** en los dos sistemas: aparecen en `docker inspect` y en el entorno de cualquier proceso hijo (por ejemplo, el `pg_dump` del backup).                                                                                                                                                                             | Media             | F1·1, F3·6       |
| S6  | La API de [t3d] usa el **superusuario** de Postgres, y su endpoint de backup descarga la base completa, con hashes de contraseñas.                                                                                                                                                                                                                                  | Alta              | F2·6, F3·2       |
| S7  | El compose de [t3d] publica Postgres, API y web en todas las interfaces. Con `trust proxy 1`, un `X-Forwarded-For` falso esquiva el límite por IP si se le pega directo a la API.                                                                                                                                                                                   | Alta al exponerse | F3·4             |
| S8  | No hay escaneo de secretos ni CI en ningún repo.                                                                                                                                                                                                                                                                                                                    | Media             | F1·4, F2·7       |
| S9  | [sf] valida pagos simulados solo con `localhost` y exige `MP_WEBHOOK_SECRET` fuera de localhost; no lee secretos desde archivo.                                                                                                                                                                                                                                     | Info              | F1·1             |
| S10 | Los permisos van en el JWT y no se revalidan por request (ventana de 15 min).                                                                                                                                                                                                                                                                                       | Baja              | aceptado         |

### 4.10 Deuda de tienda3d que afecta este plan

| ID   | Problema                                                                         | Por qué importa acá                                                               | Tarea      |
| ---- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| F-30 | La imagen de producción de la web no compila.                                    | No se puede probar el ecosistema como en producción ni desplegarlo.               | F2·1       |
| P1   | El PUT de producto reactiva archivados, rehabilita Venta Directa y filtra notas. | La web publicaría productos archivados y precios de un canal que se quiso apagar. | F2·2       |
| P2   | El PUT recrea las piezas, que cambian de ID.                                     | Los colores se asignan a piezas (T8) y la orden de producción usa IDs de pieza.   | F2·3       |
| P3   | `activeOnly=false` se lee como `true`.                                           | El selector de colores podría mostrar colores inactivos.                          | F2·4       |
| P4   | Doble consumo en la producción de llaveros.                                      | Generar una orden desde un pedido de llaveros descontaría el doble.               | F2·5       |
| P5   | API con superusuario y migraciones en el CMD de la API.                          | Impide el modelo de roles de §5.3.                                                | F2·6, F3·2 |
| P6   | Sin CI ni request id.                                                            | No se puede seguir un pedido entre los dos sistemas.                              | F2·7, F2·8 |

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

| Dato                                                                                          | Escribe (dueño)                                                          | Lee                                                      | Por dónde                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------- |
| Productos, recetas, costos, precios por canal                                                 | tienda3d                                                                 | —                                                        | —                                              |
| Publicaciones web, variantes, colores, atributos, fotos, categorías web, ajustes de la tienda | tienda3d (admin)                                                         | storefront                                               | vistas `storefront_v1`                         |
| Precio publicado (Venta Directa, cliente normal, cantidad 1)                                  | tienda3d (cálculo automático)                                            | storefront                                               | vista                                          |
| Stock de venta web                                                                            | tienda3d                                                                 | storefront                                               | vista + reserva por API al registrar el pedido |
| Cuentas de cliente, sesiones, direcciones                                                     | storefront                                                               | tienda3d (como `Customer` tipo STANDARD, origen web: D4) | evento `customer.upserted`                     |
| Pedido (datos de la compra)                                                                   | storefront                                                               | tienda3d (registro)                                      | API `POST …/orders`                            |
| Estado de **pago**                                                                            | storefront (MP en F19; transferencia confirmada por el admin vía evento) | tienda3d                                                 | eventos                                        |
| Estado de **preparación / entrega**                                                           | tienda3d                                                                 | storefront                                               | eventos                                        |
| Solicitudes de personalización                                                                | storefront (recibe) → tienda3d (gestiona)                                | —                                                        | outbox con adjunto                             |
| Mails al cliente y aviso de pedido a la tienda                                                | storefront                                                               | —                                                        | SMTP                                           |

### 5.3 Bases y roles

Una instancia de PostgreSQL con **dos bases**, igual que tendrá RDS. Ningún servicio usa el
superusuario.

| Rol                                        | Base       | Puede                                                                  | Lo usa                            |
| ------------------------------------------ | ---------- | ---------------------------------------------------------------------- | --------------------------------- |
| `postgres` (superusuario; _master_ en RDS) | todas      | todo                                                                   | solo el init y el mantenimiento   |
| `tienda3d_owner`                           | tienda3d   | dueño de `public` y `storefront_v1`; DDL                               | servicio `tienda3d-migrate`       |
| `tienda3d_app`                             | tienda3d   | SELECT/INSERT/UPDATE/DELETE en `public`, uso de secuencias, sin DDL    | `tienda3d-api`                    |
| `storefront_reader`                        | tienda3d   | `USAGE` en `storefront_v1` + `SELECT` en sus vistas. Nada en `public`. | `storefront`, `storefront-worker` |
| `storefront_owner`                         | storefront | dueño; migraciones Prisma                                              | servicio `storefront-migrate`     |
| `storefront_app`                           | storefront | DML                                                                    | `storefront`, `storefront-worker` |

Reglas:

- `REVOKE CONNECT ON DATABASE … FROM PUBLIC` en las dos bases.
- `ALTER DEFAULT PRIVILEGES FOR ROLE <owner>`, para que las tablas nuevas de cada migración le den permisos al rol `_app`.
- Ajustes de `storefront_reader`: `default_transaction_read_only = on`, `statement_timeout = '5s'`, `idle_in_transaction_session_timeout = '10s'`, `search_path = storefront_v1` y `CONNECTION LIMIT 10`.
- Las vistas usan `security_barrier`. Pertenecen a `tienda3d_owner` y corren con sus permisos, así que el lector no necesita acceso a las tablas.
- Nada de esto requiere superusuario: el mismo script corre en RDS.

### 5.4 Contrato de lectura `storefront_v1`

Vistas (columnas mínimas). Solo muestran publicaciones `PUBLISHED`, con producto del sistema activo
y precio calculado:

| Vista                | Columnas                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products`           | `id, slug, name, summary, description, seo_title, seo_description, option_label, featured, sort_order, published_at, updated_at`                                       |
| `variants`           | `id, product_id, sku, member_value_key, member_value_label, member_sort, price_cents, availability, available_quantity, max_per_order, lead_time_days, image_id, sort` |
| `variant_options`    | `variant_id, option_kind ('member'\|'color'\|'attribute'), option_key, option_label, value_key, value_label, color_hex, option_sort, value_sort`                       |
| `images`             | `id, product_id, path, alt, width, height, position, color_value_key`                                                                                                  |
| `categories`         | `id, slug, name, description, parent_id, image_path, sort_order`                                                                                                       |
| `product_categories` | `product_id, category_id`                                                                                                                                              |
| `slug_redirects`     | `old_slug, product_slug`                                                                                                                                               |
| `store_settings`     | `shipping_flat_rate_cents, free_shipping_from_cents, pickup_enabled, pickup_instructions, bank_transfer_enabled, bank_transfer_instructions, notification_email`       |

- Los montos se exponen en **centavos enteros** (el storefront ya trabaja así); tienda3d sigue con `Decimal(14,2)`.
- **Ninguna vista expone** costos, recetas, proveedores, markups, notas internas, clientes ni usuarios.
- Versionado: los cambios aditivos van en `v1`; un cambio que rompe crea `storefront_v2` y se convive hasta migrar el sitio.

### 5.5 Integración entre sistemas

**Del storefront a tienda3d.** Llamadas HTTP por la red interna a
`http://tienda3d-api:3001/api/integrations/storefront/v1/…`:

| Endpoint                           | Cuándo                                                                                                                               | Idempotencia                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `POST /orders`                     | al confirmar la compra (sincrónico, D2): valida precios contra el precio publicado, reserva stock y devuelve el código `W-AAAA-NNNN` | `externalId` = uuid del pedido del sitio |
| `POST /orders/{externalId}/events` | `payment_updated`, `cancelled_by_customer` (por outbox)                                                                              | `eventId`                                |
| `POST /customers`                  | `customer.upserted` (por outbox)                                                                                                     | id del cliente en el sitio               |
| `POST /quote-requests` (multipart) | solicitud de personalización (por outbox)                                                                                            | id de la solicitud                       |
| `GET /ping`                        | health de la integración                                                                                                             | —                                        |

- **Autenticación:** `Authorization: Bearer <clave>`. La clave tiene 32 bytes aleatorios; tienda3d guarda solo su SHA-256 en `integration_clients` (con alcances, `lastUsedAt` y `revokedAt`) y la compara con `timingSafeEqual`.
- **Rotación:** se admiten dos claves activas a la vez durante el cambio.
- **Exposición:** la ruta es `@Public` para el JWT, pero lleva su propio guard y su propio límite. El proxy de `tienda3d-web` y Caddy devuelven 404 a `/api/integrations/*`: solo se llega por la red interna.

**De tienda3d al storefront.** Eventos a `http://storefront:3100/api/internal/events/` (con barra final: el sitio usa `trailingSlash`):

| Evento                                                      | Efecto en el sitio                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `catalog.changed {scope, ids}`                              | `revalidateTag` del catálogo, del producto o de los ajustes            |
| `order.fulfillment_changed {externalId, status, tracking?}` | actualiza el pedido, suma al historial y manda mail al cliente         |
| `order.payment_confirmed_manually {externalId}`             | marca la transferencia como pagada y emite `payment_updated` de vuelta |

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

| Eje                               | Dueño      | Estados                                                                                                                |
| --------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pago (`paymentStatus`)            | storefront | `PENDING` → `AWAITING_TRANSFER` → `APPROVED` · `REJECTED` · `REFUNDED` (este último en F19)                            |
| Preparación (`fulfillmentStatus`) | tienda3d   | `RECEIVED` → `PREPARING` → `READY_FOR_PICKUP` (retiro) / `SHIPPED` con seguimiento (envío) → `DELIVERED` · `CANCELLED` |

Reglas:

- `PREPARING` exige pago `APPROVED`.
- `CANCELLED` libera el stock reservado.
- El cliente ve una etiqueta combinada ("Esperando tu transferencia", "En preparación", "Listo para retirar", "Enviado — seguimiento …", "Entregado", "Cancelado").
- Las transiciones por forma de entrega se portan desde `ADMIN_TRANSITIONS` del storefront.

### 5.7 Fotos y archivos

| Volumen       | Escribe      | Lee                           | Contenido                                                             |
| ------------- | ------------ | ----------------------------- | --------------------------------------------------------------------- |
| `media`       | tienda3d-api | storefront (ro), tienda3d-api | `catalog/<webProductId>/<uuid>.webp`, `categories/<uuid>.webp`        |
| `t3d-private` | tienda3d-api | tienda3d-api                  | adjuntos de solicitudes de personalización                            |
| `sf-private`  | storefront   | storefront                    | adjuntos pendientes de entregar (se borran al confirmarse la entrega) |

- Proceso al subir: verificación de tipo por _magic bytes_ (jpg, png, webp), límite de 15 MB, `sharp` → WebP de máximo 2000 px y sin metadatos EXIF.
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

| Ambiente | Dónde viven                                                                                                                                                                          | Cómo llegan al contenedor                                                                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local    | `tienda-plastik-infra/secrets/local/*.txt` (ignorado por git, permisos `600`), generados con `openssl rand` por `scripts/secrets/init-local.sh`                                      | `secrets:` de Compose (archivos)                                                                                                                                                                                                                                                  |
| EC2      | **AWS Systems Manager Parameter Store**, parámetros `SecureString` de nivel **estándar** bajo `/tienda-plastik/prod/<servicio>/<nombre>`, cifrados con la clave administrada por AWS | Un servicio systemd (`fetch-secrets`) corre antes de `docker compose up`, lee por `GetParametersByPath` con el **rol IAM de la instancia** (sin claves de AWS en el disco) y escribe en tmpfs `/run/tienda-plastik/secrets` (`0400`, uid 1001), que Compose monta como `secrets:` |

**Costo del almacén en EC2:**

- Parameter Store no cobra los parámetros de nivel estándar ([AWS: tipos y niveles de parámetros](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html)).
- El descifrado de los `SecureString` usa KMS, que se factura aparte ([AWS: KMS y Parameter Store](https://docs.aws.amazon.com/kms/latest/developerguide/services-parameter-store.html)). KMS incluye **20.000 solicitudes por mes gratis** ([precios de KMS](https://aws.amazon.com/kms/pricing/)), y aquí las lecturas son unas pocas por arranque.
- Las alternativas pagas (Secrets Manager) no hacen falta.

**Inventario:**

| Secreto                                                      | Servicios                                                       | Uso                  |
| ------------------------------------------------------------ | --------------------------------------------------------------- | -------------------- |
| `pg_superuser_password`                                      | db (init)                                                       | administración       |
| `tienda3d_owner_password` · `tienda3d_app_password`          | tienda3d-migrate · tienda3d-api                                 | base del sistema     |
| `storefront_owner_password` · `storefront_app_password`      | storefront-migrate · storefront, worker                         | base del sitio       |
| `storefront_reader_password`                                 | storefront, worker                                              | lectura del catálogo |
| `jwt_secret` · `refresh_secret`                              | tienda3d-api                                                    | sesiones del panel   |
| `seed_admin_password`                                        | tienda3d-migrate (solo la primera vez)                          | admin inicial        |
| `storefront_api_key`                                         | storefront (en claro); en tienda3d se guarda su hash en la base | API de servicio      |
| `events_secret_t3d_to_sf` · `events_secret_sf_to_t3d`        | los dos                                                         | firma de eventos     |
| `session_secret` (si hace falta para firmar tokens de email) | storefront                                                      | cuentas de cliente   |
| `smtp_url`                                                   | storefront, worker                                              | mails                |
| `mp_access_token` · `mp_webhook_secret`                      | storefront (F19)                                                | Mercado Pago         |
| futuros: MELI, ARCA, WhatsApp                                | tienda3d-api                                                    | integraciones        |

**Alternativas también gratuitas**, por si no se va a AWS o para versionar secretos de un ambiente de
prueba: **SOPS + age** (archivos cifrados en git), **Infisical** autoalojado y **Bitwarden Secrets
Manager** (plan gratuito).

### 5.9 Redes y puertos

| Servicio                                       | Red                 | Puerto publicado en local                 | En EC2                                          |
| ---------------------------------------------- | ------------------- | ----------------------------------------- | ----------------------------------------------- |
| caddy                                          | `edge`              | 80 (y 443 con `tls internal`, opcional)   | 80/443 (único abierto en el Security Group)     |
| storefront · tienda3d-web                      | `edge` + `internal` | ninguno                                   | ninguno                                         |
| tienda3d-api · storefront-worker · migraciones | `internal`          | ninguno                                   | ninguno                                         |
| db                                             | `internal`          | `127.0.0.1:5452` solo con el perfil `dev` | ninguno (RDS: Security Group solo desde la EC2) |
| mailpit                                        | `internal` + `edge` | vía `correo.localhost`                    | no existe (SMTP real)                           |

---

## 6. Fases

Cada fase indica el repo, de qué depende, la estimación propuesta y sus tareas. Una tarea tiene
**Qué hacer** y **Cierra cuando**; la fase cierra con su **Verificación**.

| Fase      | Tema                                   | Repo           | Depende de     | Estimación    |
| --------- | -------------------------------------- | -------------- | -------------- | ------------- |
| F0        | Base de trabajo                        | t3d, sf        | —              | 3–5 h         |
| F1        | Secretos y configuración               | t3d, sf, infra | F0             | 8–12 h        |
| F2        | Endurecer tienda3d para integrarse     | t3d            | F0             | 12–20 h       |
| F3        | Ecosistema local en Docker             | infra, t3d, sf | F1, F2·1, F2·6 | 10–16 h       |
| F4        | Permisos de tienda online para `admin` | t3d            | F0             | 2–4 h         |
| F5        | Modelo del catálogo web                | t3d            | F2·2, F2·3, F4 | 16–24 h       |
| F6        | Fotos en volumen                       | t3d            | F3·5, F5·1     | 8–12 h        |
| F7        | Precio publicado = Venta Directa       | t3d            | F5·2           | 8–12 h        |
| F8        | Panel "Tienda online"                  | t3d            | F5, F6, F7     | 24–36 h       |
| F9        | Migración del catálogo actual          | t3d            | F8, D12        | 6–10 h        |
| F10       | Contrato de lectura                    | t3d, infra     | F5, F7         | 8–12 h        |
| F11       | Integración entre sistemas             | t3d, sf        | F3, F10        | 12–18 h       |
| F12       | El sitio lee el catálogo del sistema   | sf             | F9, F10, F11   | 12–18 h       |
| F13       | Cuentas de cliente                     | sf             | F12            | 20–30 h       |
| F14       | Pedidos de punta a punta               | t3d, sf        | F11, F13       | 30–45 h       |
| F15       | Solicitudes de personalización         | t3d, sf        | F11, F13       | 10–15 h       |
| F16       | Prueba integral local y decisión       | infra, sf      | F12–F15        | 12–18 h       |
| **Local** |                                        |                |                | **201–307 h** |
| F17       | Despliegue en EC2 (si F16 da "sí")     | infra          | F16            | 16–24 h       |
| F18       | Base en RDS (largo plazo)              | infra          | F17            | 6–10 h        |
| F19       | Mercado Pago                           | sf             | F17            | 10–16 h       |
| F20       | Lanzamiento y baja del WordPress       | infra, sf      | F17            | 6–10 h        |

Lo que se puede hacer en paralelo: F4 con F2; F15 con F14; F9 en cuanto F8 permite cargar datos.

---

### F0 — Base de trabajo · 3–5 h

> **Objetivo:** repos en un punto estable, datos sensibles fuera de los repos y decisiones confirmadas.

- [ ] **F0·1 [t3d] El trabajo del sistema arranca desde su última versión corregida**
  - Para qué: que la unificación parta de todo lo arreglado en la auditoría, sin cambios sueltos ni ramas a medio subir.
  - Qué hacer:
    - Commitear el rename de `docs/FUNCIONALIDADES.md` → `docs/funcionalidades-sistema-gestion.md`.
    - Pushear `fix/auditoria-correcciones`.
    - Mergearla a `develop` y `develop` a `main` (o definir que `develop` es la base y dejarlo escrito).
  - Cierra cuando: la rama base de tienda3d contiene `dba0c3a` y `git status` está limpio.
- [ ] **F0·2 [t3d] Los volcados con datos de clientes quedan fuera de las carpetas de los repos**
  - Para qué: que una copia de la base con usuarios y clientes no termine en un commit, una imagen o una carpeta compartida.
  - Qué hacer: mover `tienda3d_dump_2026-07-22.sql` a una carpeta de respaldos fuera de los repos, con el disco cifrado (FileVault). Revisar que no queden otros `*.sql` o `*.dump`.
  - Cierra cuando: `find <repos> -maxdepth 2 -name '*.sql'` no devuelve volcados con datos.
- [ ] **F0·3 [t3d] Las decisiones abiertas del plan quedan definidas**
  - Para qué: trabajar sobre definiciones confirmadas y no sobre supuestos.
  - Qué hacer: registrar en §3 la respuesta de cada decisión abierta y ajustar las tareas que cambian.
  - Cierra cuando: §3 no tiene propuestas sin confirmar que bloqueen F1–F5.
- [ ] **F0·4 [t3d][sf] Sabemos qué pruebas pasan hoy en los dos sistemas antes de tocar nada**
  - Para qué: distinguir lo que rompa la unificación de lo que ya estaba roto.
  - Qué hacer: correr la verificación mínima de los dos repos y la e2e del storefront.
  - Cierra cuando: la bitácora registra los resultados (o los tests que fallan, con su motivo).
- [ ] **F0·5 [t3d] La dueña recibe las diferencias del catálogo para confirmarlas**
  - Para qué: publicar la tienda nueva con los productos, colores y precios que ella reconoce.
  - Qué hacer: armar el pedido con las 4 diferencias de §4.8 (TPK/PTK, Noche/Día, Riso, 380 vs 390), los 11 colores y a qué línea de filamento pertenecen, y el aviso de que los precios cambian (T5).
  - Cierra cuando: el pedido está enviado; su respuesta desbloquea F9.
  - Hecho así: respondido por Pablo el 2026-10-28 (ver D12 y el anexo). La comparación con datos reales queda para el final, con el dump de la base del sistema que tiene Camila.

**Verificación:** las cinco tareas cerradas.

---

### F1 — Secretos y configuración · 8–12 h

> **Objetivo:** los dos sistemas leen secretos desde archivos, rechazan valores débiles y no se puede
> commitear un secreto sin que salte una alarma.

- [ ] **F1·1 [t3d][sf] Los sistemas leen sus claves desde archivos y no desde variables de entorno**
  - Para qué: que las claves no queden expuestas en la configuración de los contenedores ni en los procesos que lanzan.
  - Qué hacer:
    - Crear un helper `readSecret(name)`: si existe `NAME_FILE`, lee el archivo y recorta el salto de línea; si no, usa `NAME`.
    - [t3d]: crear `apps/api/src/common/config/env.schema.ts` (zod) con **todas** las variables de §4.2, validado al arrancar (`ConfigModule.forRoot({ validate })`), y reemplazar las lecturas sueltas de `ConfigService.get` por el objeto tipado.
    - [t3d]: Prisma toma `DATABASE_URL`; armarla desde partes (`DB_HOST`, `DB_USER`, `DB_PASSWORD_FILE`…) en el arranque, antes de instanciar `PrismaService`.
    - [sf]: aplicar lo mismo en `src/server/env.ts`.
  - Cierra cuando:
    - con `JWT_SECRET_FILE=/run/secrets/jwt_secret` y sin `JWT_SECRET`, la API arranca;
    - con ambos ausentes, falla con un mensaje claro;
    - hay tests unitarios del helper y del esquema en los dos repos.
- [ ] **F1·2 [t3d][sf] Ningún sistema arranca en producción con claves débiles o de ejemplo**
  - Para qué: que un descuido de configuración no deje el sistema abierto con contraseñas conocidas.
  - Qué hacer:
    - [t3d]: sumar a `assertSecrets` la clave de la base, `SEED_ADMIN_PASSWORD` (si corre el seed) y las credenciales de integraciones habilitadas.
    - [sf]: en `production`, exigir `SITE_URL` https, secretos de ≥32 caracteres, `PAYMENTS_PROVIDER ≠ fake` y las claves de MP si el proveedor es `mercadopago`.
    - Los dos rechazan los valores de ejemplo conocidos (`changeme`, `admin123`, `cambiar-esta-clave`, `plastik-dev`, `replace-with-…`).
  - Cierra cuando: hay un test por regla, y arrancar en `production` con un valor de ejemplo corta con el nombre de la variable.
- [ ] **F1·3 [infra] Las claves locales se generan con un solo comando**
  - Para qué: armar el entorno sin inventar ni pasarse contraseñas a mano.
  - Qué hacer: `scripts/secrets/init-local.sh` crea cada archivo del inventario (§5.8) con `openssl rand -base64 32`, permisos `600`, **sin pisar los que existen**, e imprime la lista (no los valores).
  - Cierra cuando: correrlo dos veces no cambia ningún archivo, y `git status` no los muestra.
- [ ] **F1·4 [t3d][sf][infra] Un commit con una clave adentro se frena antes de salir de la máquina**
  - Para qué: que ninguna clave llegue a GitHub por error, sin gastar minutos de GitHub Actions.
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
- [ ] **F1·5 [t3d] La base del taller deja de usar las contraseñas de ejemplo**
  - Para qué: cerrar el acceso con claves públicas (`changeme`, `admin123`) a la base en uso.
  - Qué hacer:
    - `ALTER USER` del Postgres local con la clave nueva y cambio de la clave del admin desde el panel.
    - Mover los dos valores a archivos de secretos.
    - **Pedir OK antes**, porque toca la base en uso.
    - **Se hace con el despliegue** (decisión de Pablo, 2026-10-28).
  - Cierra cuando: el `.env` de [t3d] no contiene `changeme` ni `admin123`, y el login funciona con la clave nueva.
- [ ] **F1·6 [infra] Hay un procedimiento escrito para cambiar cada clave**
  - Para qué: poder rotar una clave comprometida en minutos y sin cortar el servicio.
  - Qué hacer: escribir `docs/secretos.md` con la tabla de §5.8, el procedimiento de rotación de cada secreto (base, JWT, clave de API con dos activas, secretos de eventos, MP) y qué reiniciar en cada caso.
  - Cierra cuando: hay una rotación de prueba de `storefront_api_key` hecha siguiendo el runbook, sin cortar la integración (después de F11).

**Verificación:** tests de los dos repos en verde; `gitleaks git` en verde en los tres repos.

---

### F2 — Endurecer tienda3d para integrarse · 12–20 h

> **Objetivo:** que el sistema sea una fuente de verdad confiable para la web y se pueda construir
> como en producción.

- [ ] **F2·1 [t3d] El panel del sistema se puede construir como imagen de producción**
  - Para qué: probar el ecosistema como va a correr en el servidor y poder desplegarlo (F-30).
  - Qué hacer: seguir los pasos que dejó el plan de auditoría (§F-30 de `correcciones-auditoria-2026-08.md`): reproducir con `docker build --target build`, probar `pnpm deploy --filter web` o copiar el workspace completo al stage de build, y `outputFileTracingRoot`.
  - Cierra cuando: `docker compose -f docker-compose.yml build web` termina y `/login` responde 200 desde la imagen.
- [ ] **F2·2 [t3d] Editar un producto no cambia lo que no se tocó**
  - Para qué: que guardar una ficha no reactive productos archivados ni vuelva a habilitar Venta Directa, cosas que la tienda publicaría.
  - Qué hacer:
    - En el PUT, `isActive` omitido conserva el valor actual.
    - `channels` omitido conserva los canales.
    - La respuesta del PUT respeta la visibilidad de `notes`.
  - Cierra cuando: hay tests de integración para los tres casos (producto archivado, Directa apagada y usuario sin `parameter:write`).
- [ ] **F2·3 [t3d] Las piezas de un producto conservan su identidad al editarlo**
  - Para qué: poder atar los colores de la tienda y las órdenes de producción a cada pieza.
  - Qué hacer: el PUT hace upsert de las piezas por `id` (crea las nuevas, actualiza las existentes y borra solo las quitadas). Agregar `id` opcional a `pieceSchema` y mandarlo desde `product-editor.tsx`.
  - Cierra cuando: editar los gramos de una pieza mantiene su `id` (test), y las órdenes de producción existentes no se rompen.
- [ ] **F2·4 [t3d] El filtro de activos e inactivos funciona en insumos y categorías**
  - Para qué: que el selector de colores no ofrezca colores dados de baja.
  - Qué hacer: reemplazar `z.coerce.boolean` por un parser de `'true'`/`'false'` en `materials.controller.ts:59` y `categories.controller.ts:37`.
  - Cierra cuando: un test con `activeOnly=false` devuelve los inactivos.
- [ ] **F2·5 [t3d] Producir llaveros consume solo las piezas de su escala**
  - Para qué: que una orden de producción de llaveros no descuente el doble de filamento.
  - Qué hacer: en `productions.service.ts` (consumo y costo), usar las piezas `INDIVIDUAL` para cantidades 1–4 y `BATCH ÷ keychain_batch_size` para 5+, igual que las cotizaciones.
  - Cierra cuando: un test con un producto KEYCHAIN da el mismo consumo que la cotización para 1 y para 10 unidades.
- [ ] **F2·6 [t3d] El sistema funciona con un usuario de base sin privilegios**
  - Para qué: que una falla en la API no pueda cambiar la estructura de la base ni leer más de lo que necesita.
  - Qué hacer:
    - Sacar `prisma migrate deploy` del CMD de `apps/api/Dockerfile` y crear el target o comando `migrate`, que corre con `MIGRATION_DATABASE_URL` (owner) y después aplica `db/grants.sql` (F10·2).
    - La API usa `DATABASE_URL` con `tienda3d_app`.
    - Documentar en el README cómo se corre en local sin el repo de infra.
  - Cierra cuando: con la API conectada como `tienda3d_app`, toda la suite de integración pasa y un `CREATE TABLE` desde esa conexión falla.
- [ ] **F2·7 [t3d] Un cambio que rompe las pruebas no se puede subir**
  - Para qué: sostener la calidad con verificación local, sin depender de GitHub Actions.
  - Qué hacer:
    - Hooks de lefthook (los de F1·4 más los de verificación):
      - `pre-commit` corre formato y lint de los archivos tocados;
      - `pre-push` corre `pnpm typecheck` y los tests unitarios.
    - Script `pnpm verify` que corre typecheck, lint, tests unitarios y tests de integración. Para la integración levanta un Postgres efímero con `docker run --rm` si no hay `TEST_DATABASE_URL`.
    - **Sin GitHub Actions.**
  - Cierra cuando:
    - un push con un test roto se rechaza;
    - `pnpm verify` en verde desde un clon limpio.
- [ ] **F2·8 [t3d] Cada pedido se puede seguir en los registros de los dos sistemas**
  - Para qué: diagnosticar un problema de punta a punta con un solo identificador.
  - Qué hacer:
    - `pinoHttp.genReqId` toma `x-request-id` si viene y, si no, genera uno.
    - La API devuelve el id en la respuesta.
    - El proxy de la web lo reenvía.
  - Cierra cuando: un request con `x-request-id: prueba-123` aparece con ese id en el log de la API.
- [ ] **F2·9 [t3d] La sesión del panel se renueva sola en todas las secciones**
  - Para qué: que el admin no vuelva al login en Clientes, Categorías, Reportes o Tienda online.
  - Qué hacer: sumar `/clientes`, `/categorias`, `/reportes` y `/tienda-online` a `PROTECTED_PREFIX` (`apps/web/src/proxy.ts`).
  - Cierra cuando: navegar a `/clientes` con el access token por vencer lo refresca sin pasar por el login.

**Verificación:** `pnpm verify` de [t3d] en verde y build de las dos imágenes de producción.

---

### F3 — Ecosistema local en Docker · 10–16 h

> **Objetivo:** levantar todo el ecosistema, como en producción, con un solo comando.

- [ ] **F3·1 [infra] El ecosistema tiene su repo de infraestructura**
  - Para qué: un lugar único para levantar, respaldar y desplegar los dos sistemas juntos (D1).
  - Qué hacer: crear el repo privado en la carpeta madre con:
    - `compose.yaml`, `compose.dev.yaml`, `Caddyfile`;
    - `db/init/`, `scripts/` y `docs/`;
    - `secrets/` en `.gitignore`;
    - un README con el arranque.
  - Cierra cuando: el repo existe en GitHub y `CLAUDE.md` de la carpeta madre lo lista.
- [ ] **F3·2 [infra] Cada servicio entra a la base solo con los permisos que necesita**
  - Para qué: que el sitio no pueda tocar los datos del sistema y viceversa.
  - Qué hacer:
    - `db/init/00-roles.sh` lee `/run/secrets/*` y crea los roles y las bases de §5.3 con `REVOKE CONNECT … FROM PUBLIC`.
    - Debe ser idempotente y no requerir superusuario más allá del init, para reusarlo en RDS (F18).
    - El puerto se publica solo en `127.0.0.1:5452` con el perfil `dev`.
  - Cierra cuando: `storefront_reader` no puede conectarse a la base `storefront`, `storefront_app` no puede conectarse a `tienda3d` y `tienda3d_app` no puede hacer DDL.
- [ ] **F3·3 [infra] El ecosistema completo se levanta con un comando**
  - Para qué: probar todo en local tal como va a correr en el servidor.
  - Qué hacer:
    - Servicios `db`, `tienda3d-migrate`, `tienda3d-api`, `tienda3d-web`, `storefront-migrate`, `storefront`, `storefront-worker` (desde F11), `mailpit` y `caddy`.
    - `build.context` apunta a `../tienda3d` y `../tienda-plastik-page/storefront`.
    - Healthchecks en todos y `depends_on` con `service_healthy` / `service_completed_successfully`.
    - `restart: unless-stopped`, logs `json-file` con `max-size`.
  - Cierra cuando: desde cero (sin volúmenes), `docker compose up -d --build` deja todo en `healthy`, con los dos sitios respondiendo.
- [ ] **F3·4 [infra] Una sola puerta de entrada atiende al público**
  - Para qué: que las rutas internas entre los sistemas no se puedan alcanzar desde afuera.
  - Qué hacer:
    - `tienda.localhost` → storefront, `sistema.localhost` → tienda3d-web, `correo.localhost` → mailpit.
    - Responde 404 a `/api/internal/*` y `/api/integrations/*`.
    - Cabeceras de seguridad (HSTS solo con TLS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) y `x-request-id`.
    - `tls internal` opcional para probar cookies `Secure`.
  - Cierra cuando: `curl http://tienda.localhost/api/internal/events` da 404 desde el host, y desde la red interna da 401 sin firma (después de F11).
- [ ] **F3·5 [infra] El sistema guarda las fotos y el sitio solo puede leerlas**
  - Para qué: compartir las fotos sin que el sitio pueda modificarlas ni borrarlas.
  - Qué hacer: crear `pgdata`, `media` (rw en tienda3d-api, `:ro` en storefront y worker), `t3d-private`, `sf-private` y `backups`, con uid 1001.
  - Cierra cuando: la API escribe un archivo en `media`, el storefront lo lee, y escribir desde el storefront falla con `EROFS`.
- [ ] **F3·6 [infra] Ninguna clave aparece en la configuración de los contenedores**
  - Para qué: que inspeccionar un contenedor no revele contraseñas.
  - Qué hacer: sección `secrets:` de Compose con los archivos de `secrets/local/`; cada servicio monta solo los suyos y recibe `*_FILE`. `NODE_ENV=production` en el perfil por defecto.
  - Cierra cuando: `docker inspect` de cada contenedor no contiene ningún valor de `secrets/local/`, y las cookies del sistema salen con `Secure` bajo `tls internal`.
- [ ] **F3·7 [infra] Todo el ecosistema se respalda y se restaura con un comando**
  - Para qué: recuperar bases y fotos después de un error o de perder el equipo.
  - Qué hacer:
    - `scripts/backup.sh` hace `pg_dump -Fc` de las dos bases y `tar` de `media` y de los privados, con fecha, a `backups/`.
    - `scripts/restore.sh` pide confirmación antes de pisar.
    - `make up/down/logs/backup/restore/ps`.
  - Cierra cuando: un backup restaurado en un ecosistema limpio deja los dos sitios con los mismos datos y fotos.
- [ ] **F3·8 [infra] Se puede desarrollar sobre el ecosistema con recarga en vivo**
  - Para qué: trabajar en cualquiera de los dos sistemas sin reconstruir imágenes.
  - Qué hacer: `compose.dev.yaml` con bind mounts y hot reload de las dos apps sobre el mismo Postgres.
  - Cierra cuando: un cambio en un componente del storefront o del panel se ve sin reconstruir la imagen.

**Verificación:** desde un clon limpio, `scripts/secrets/init-local.sh && make up` deja el ecosistema
funcionando, y `make backup && make restore` funciona.

---

### F4 — Permisos de tienda online para `admin` · 2–4 h

> **Objetivo:** que solo el rol `admin` (T1) vea y gestione la tienda online.

- [ ] **F4·1 [t3d] Solo el rol admin tiene permisos sobre la tienda online**
  - Para qué: que operadores y usuarios de solo lectura no puedan publicar productos ni ver pedidos web.
  - Qué hacer:
    - Crear `ecommerce:read`, `ecommerce:write` (catálogo web y fotos), `ecommerce:orders` (pedidos web y solicitudes) y `ecommerce:settings` (ajustes de la tienda), con descripción en español.
    - Migración con `INSERT … ON CONFLICT DO NOTHING` de los permisos y su asignación al rol `admin`.
    - En `seed.ts`: sumarlos a `PERMISSIONS` y **excluirlos** de `operator` y de `viewer`, que toma todas las `:read`.
  - Cierra cuando:
    - un test del seed comprueba que `admin` los tiene y `operator`/`viewer` no;
    - `route-permissions.spec.ts` reconoce las claves;
    - aplicar la migración sobre una copia de la base en uso se los da al admin actual.
- [ ] **F4·2 [t3d] El admin ve la sección Tienda online en el menú**
  - Para qué: entrar a la gestión del ecommerce desde el sistema.
  - Qué hacer: agregar el grupo en `apps/web/src/components/nav.ts` (Publicaciones, Pedidos web, Solicitudes, Categorías web, Ajustes), cada ítem con su permiso. Los clientes de la web se ven en Clientes, con su filtro (D4).
  - Cierra cuando: con el usuario `operator` el grupo no aparece y las rutas redirigen; con `admin`, sí.

**Nota:** el RBAC es dinámico, así que un admin podría darle `ecommerce:*` a otro rol desde
Administración → Roles. Es aceptable, porque solo el admin tiene `role:manage`.

**Verificación:** verificación mínima de [t3d].

---

### F5 — Modelo del catálogo web · 16–24 h

> **Objetivo:** que el sistema pueda describir todo lo que muestra la tienda, sin tocar el modelo de
> costeo.

- [ ] **F5·1 [t3d] El sistema puede describir todo lo que muestra la tienda**
  - Para qué: tener la base para gestionar desde el sistema publicaciones, variantes, fotos, categorías y ajustes.
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

- [ ] **F5·2 [t3d] Un producto web agrupa uno o más productos del sistema**
  - Para qué: vender como una sola ficha los productos que son tamaños o modelos de lo mismo.
  - Qué hacer:
    - Endpoints `GET/POST /web-catalog/products`, `GET/PATCH /web-catalog/products/:id`, `PUT /web-catalog/products/:id/members` (`ecommerce:read` / `ecommerce:write`).
    - Reglas: un producto del sistema pertenece a una sola publicación, debe estar activo y tener Venta Directa habilitada.
    - Al cambiar el `slug`, el viejo queda en `WebProductSlug`.
    - Auditoría con `AuditService.record`.
  - Cierra cuando: hay tests de integración de las reglas, del cambio de slug y del rechazo de un producto que ya está en otra publicación.
- [ ] **F5·3 [t3d] Cada producto web ofrece solo los colores elegidos de su filamento**
  - Para qué: mostrar, por ejemplo, 2 colores aunque se pueda imprimir en 5.
  - Qué hacer:
    - `PUT /web-catalog/products/:id/color-options`. Cada opción tiene línea de filamento, colores elegidos y piezas.
    - Por defecto, las piezas son todas las de los miembros cuyo `defaultFilamentId` es esa línea.
    - Validar que la línea esté usada por las piezas elegidas y que cada color sea un hijo **activo** de esa línea.
    - Si un color se desactiva en Insumos, las variantes que lo usan dejan de venderse y el panel lo avisa.
    - Hecho así: el DTO marca el color inactivo (`values[].isActive`) para el aviso del panel, y las vistas de F10·1 no muestran variantes con un color inactivo. Quitar un color de una opción desactiva sus variantes; una opción con variantes que se quita queda inactiva (`WebColorOption.isActive`), igual que un miembro (F5·2). Un miembro que sale de la publicación saca sus piezas de las opciones.
  - Cierra cuando: hay tests que rechazan un color de otra línea, un color inactivo y una pieza de otro producto.
- [ ] **F5·4 [t3d] Un producto web puede tener opciones informativas que no cambian el precio**
  - Para qué: ofrecer "Tipo de hoja" sin crear un producto del sistema por cada valor (D6).
  - Qué hacer: `PUT /web-catalog/products/:id/attributes` (etiqueta + valores ordenados).
  - Cierra cuando: un cuaderno con "Tipo de hoja: Cuadro/Punto" genera variantes por cada valor, con el mismo precio.
  - Hecho así: los valores se asocian por id o por slug (renombrar conserva el id). Un valor o atributo con variantes que se quita queda inactivo y sus variantes dejan de venderse (migración `web_attributes.isActive`). La matriz de combinaciones es un dominio puro (`web-catalog/domain/variant-matrix.ts`) que reusa F5·5: cada miembro se multiplica solo por las opciones de color que pintan sus piezas y por todos los atributos; el precio sale del miembro, así que los atributos no lo cambian.
- [ ] **F5·5 [t3d] Cada combinación vendible tiene su SKU, su disponibilidad y su stock**
  - Para qué: saber exactamente qué se vende, si hay y cuánto tarda en fabricarse.
  - Qué hacer:
    - `POST /web-catalog/products/:id/variants/regenerate`: arma la matriz miembro × valores de cada opción de color × valores de cada atributo, portando `planVariants` (conserva, crea y desactiva; nunca borra una variante con pedidos).
    - SKU nuevo `<SKU del miembro>-VNN` con un contador por miembro, inmutable.
    - `PATCH /web-catalog/variants/:id` para activa, disponibilidad (D9), stock, máximo por pedido, plazo y foto.
    - Portar las reglas de disponibilidad de `storefront/src/domain/catalog.ts` (`variantAvailability`) a un dominio puro con tests.
  - Cierra cuando: regenerar la Trapecio (2 miembros × 4 colores) da 8 variantes; quitar un color desactiva 2 y conservarlo no cambia los SKU.
  - Hecho así: dominios puros `domain/variant-plan.ts` (plan por `selectionKey` + `nextVariantSkus`) y `domain/availability.ts` (D9: `IN_STOCK` / `MADE_TO_ORDER` / `OUT_OF_STOCK` y tope por pedido, 20 por defecto como el sitio). Regenerar reactiva las variantes que vuelven a la matriz (por ejemplo, un color re-agregado) salvo las que el admin sacó de venta a mano (`pausedByAdmin`, migración nueva); prender a mano una variante cuya combinación ya no existe se rechaza. Un color inactivo en Insumos sale de la matriz. Tope de 200 combinaciones por publicación. El DTO de la publicación trae las variantes con su estado de venta.
- [ ] **F5·6 [t3d] Las categorías de la tienda se gestionan aparte de las de precios**
  - Para qué: ordenar la vidriera sin cambiar ningún precio.
  - Qué hacer: CRUD `/web-catalog/categories` (dos niveles, slug, descripción, foto y orden) y la asignación a publicaciones.
  - Cierra cuando: no se puede borrar una categoría con publicaciones o hijas (test).
  - Hecho así: `GET/POST /web-catalog/categories`, `PATCH/DELETE /web-catalog/categories/:id` y `PUT /web-catalog/products/:id/categories`. La foto la sube F6·4 (acá solo se expone `imagePath`). Dos niveles: la madre tiene que ser de primer nivel y una categoría con hijas no puede pasar a ser hija.
- [ ] **F5·7 [t3d] El admin publica u oculta un producto con un botón**
  - Para qué: controlar qué ve el cliente, con un aviso de lo que falta antes de publicar.
  - Qué hacer:
    - `POST /web-catalog/products/:id/publish` y `/hide`. `DRAFT → PUBLISHED ↔ HIDDEN`.
    - Antes de publicar se verifica: slug, al menos 1 foto, al menos 1 variante activa con precio `OK` y descripción.
    - Al publicar se responde con la lista de lo que falta.
    - Cada cambio registra auditoría y un evento `catalog.changed` en el outbox (la tabla llega en F11·3; hasta entonces, un no-op detrás de una interfaz).
  - Cierra cuando: hay tests del checklist y del ida y vuelta publicar → ocultar → publicar.
  - Hecho así: `GET /web-catalog/products/:id/checklist` para que el panel muestre lo que falta antes del clic; `publish` responde 422 con `details.missing`. Una variante cuenta si está activa, su miembro y su producto también, tiene `WebPrice` en `OK` y ningún color inactivo. `publishedAt` es la fecha de la primera publicación. El aviso es `CatalogEvents.changed(tx, {scope: 'product', ids: [slug]})`, hoy `NoopCatalogEvents`.
- [ ] **F5·8 [t3d] Envíos, retiro, transferencia y email de avisos se configuran en el sistema**
  - Para qué: cambiar las condiciones de venta sin tocar el sitio.
  - Qué hacer: `GET/PUT /web-catalog/settings` (`ecommerce:settings`) sobre `EcommerceSettings`.
  - Cierra cuando: un test cubre el guardado y la validación (montos ≥ 0, email válido).
  - Hecho así: se guarda entero (PUT); sin fila, GET devuelve los defaults. Además de montos ≥ 0 con hasta dos decimales y email válido (o vacío), exige los datos de pago si la transferencia está habilitada y que haya retiro o envío. Avisa `catalog.changed {scope: 'settings'}`. Test por HTTP, con el 403 sin `ecommerce:settings`.

**Verificación:** verificación mínima de [t3d]; `route-permissions.spec.ts` cubre las rutas nuevas.

---

### F6 — Fotos en volumen · 8–12 h

> **Objetivo:** subir, ordenar y borrar fotos desde el sistema, guardadas en el volumen `media` (T9).

- [ ] **F6·1 [t3d] Los archivos se guardan en el volumen de forma segura**
  - Para qué: que ninguna ruta armada desde afuera escriba o lea fuera de la carpeta de fotos.
  - Qué hacer: `apps/api/src/common/storage/` con `save`, `delete` y `read` sobre `MEDIA_DIR` (y `PRIVATE_DIR`), con rutas generadas por el sistema y control de _path traversal_.
  - Cierra cuando: un test intenta `../` y falla.
  - Hecho así: `StorageService` global con `save` (carpeta de segmentos `[a-z0-9_-]`, nombre `<uuid>.<ext>` con extensiones permitidas y escritura atómica), `read`, `delete` (idempotente) y `resolveExisting`. Doble control: sobre el texto (sin absolutas, `\`, `\0` ni `..`) y sobre el disco (`realpath` dentro de la raíz, así un enlace simbólico no escapa). `MEDIA_DIR` y `PRIVATE_DIR` entran a la configuración validada, con `./storage/*` por defecto en desarrollo.
- [ ] **F6·2 [t3d] El admin sube, ordena y borra las fotos de un producto**
  - Para qué: gestionar la galería desde el sistema, con fotos livianas para la web.
  - Qué hacer:
    - `POST /web-catalog/products/:id/images` (multipart con `FileInterceptor`, `memoryStorage`, máximo 15 MB y 10 archivos).
    - Verificar el tipo por _magic bytes_ y procesar con `sharp`: WebP, 2000 px como máximo, sin EXIF, guardando ancho y alto.
    - `PATCH …/images/:imageId` (alt, posición, color) y `DELETE` (borra la fila y el archivo).
    - El límite JSON global de `1mb` no aplica a esta ruta.
  - Cierra cuando: hay tests con un JPG real, un archivo `.jpg` que en realidad es texto (rechazado) y uno de 16 MB (rechazado).
  - Hecho así: `FilesInterceptor` (campo `files`, hasta 10, 15 MB c/u, en memoria). `common/storage/images.ts` reconoce JPG/PNG/WebP por sus primeros bytes y convierte con `sharp` (gira según EXIF, máximo 2000 px sin agrandar, WebP calidad 82, sin metadatos, tope de 60 MP contra bombas de descompresión); lo reusa F6·4. Si una foto del lote no sirve, no se guarda ninguna. Tope de 30 fotos por publicación. Reordenar mueve la foto y renumera la galería; la foto de un color tiene que ser de un color ofrecido. `sharp` probado en la imagen Alpine de la API.
- [ ] **F6·3 [t3d] El panel muestra las fotos subidas**
  - Para qué: ver la galería mientras se arma la publicación.
  - Qué hacer: `GET /web-catalog/media/*` autenticado (`ecommerce:read`), con `Cache-Control` privado.
  - Cierra cuando: el panel muestra una foto subida.
  - Hecho así: `WebMediaController` sirve solo `.webp` del volumen con `resolveExisting` (mismo control de path traversal), `Cache-Control: private, max-age=86400, immutable` (el nombre es un uuid). El panel la pide como `/api/web-catalog/media/<path>` por su proxy, que ya es binario y queda fuera del límite de cuerpo de `proxy.ts`. Probado de punta a punta en el ecosistema por `sistema.localhost` con la sesión del admin: subida, WebP 2000×1333 de vuelta, el archivo en el volumen `media` y el sitio lo ve de solo lectura. En [infra], `make dev` pasa `-V` para que una dependencia nueva (sharp) llegue a los `node_modules` de desarrollo.
- [ ] **F6·4 [t3d] Cada categoría de la tienda tiene su foto**
  - Para qué: armar las tarjetas de categoría de la vidriera.
  - Qué hacer: lo mismo en `/web-catalog/categories/:id/image`.
  - Cierra cuando: hay un test de subida y reemplazo, y el archivo viejo se borra.
  - Hecho así: `POST /web-catalog/categories/:id/image` (campo `file`, misma conversión que F6·2, en `categories/<id>/<uuid>.webp`) y `DELETE` para quitarla. El archivo viejo se borra después de guardar el nuevo; borrar la categoría también borra su foto.

**Verificación:** verificación mínima de [t3d]; con el ecosistema arriba, el archivo aparece en el volumen `media`.

---

### F7 — Precio publicado = Venta Directa · 8–12 h

> **Objetivo:** que el precio web sea siempre el de Venta Directa a cliente normal, cantidad 1 (T5),
> sin cargarlo a mano.

- [ ] **F7·1 [t3d] El precio web es el de Venta Directa a cliente normal**
  - Para qué: un solo precio de venta, el mismo que cotiza el sistema.
  - Qué hacer:
    - `WebPriceService.computeFor(productId)` usa `PricingService.forProduct` y toma el bloque `directa`: `base.finalPrice` o el tier con `minQty = 1`; en KEYCHAIN, la banda 1–4.
    - Si no hay bloque (Directa deshabilitada) o no hay markup, guarda `NO_PRICE` con el motivo.
    - `inputsHash` sirve para no escribir cuando nada cambió.
  - Cierra cuando: un test compara el precio publicado con el que muestra `GET /products/:id/prices` para un producto sin escalas, uno con escalas y un llavero.
  - Hecho así: `WebPriceService.computeFor` y `refresh(productId, cause)`. El bloque es el del canal `DIRECT_SALE` (si hubiera dos, el de slug `directa`). Motivos de `NO_PRICE`: Directa deshabilitada, categoría sin markup, escalas que no arrancan en 1, falta de comisión, o el mensaje del costeo (pieza sin filamento, insumo sin precio). `inputsHash` cubre precio, markup, comisión y carga impositiva; el historial se escribe solo si cambia el precio o el estado.
- [ ] **F7·2 [t3d] El precio web se actualiza solo cuando cambia un costo o un markup**
  - Para qué: no tener que acordarse de actualizar la web cada vez que sube un insumo.
  - Qué hacer:
    - Después de cada escritura de la lista de §4.3 (al confirmarse la transacción), llamar a `WebPriceService.recomputePublished()` con _debounce_ de 2 s. Son unas decenas de productos, así que se recalculan todos los que están en alguna publicación, **también en borrador**: publicar exige precio `OK` (F5·7), así que un borrador sin precio calculado no se podría publicar nunca. Sumar el recálculo del producto al agregarlo como miembro (F5·2).
    - Sumar un cron de respaldo cada 10 min y un botón "Recalcular precios" (`ecommerce:write`).
    - Si algún precio cambió, registrar `WebPriceHistory` y emitir `catalog.changed`.
  - Cierra cuando: cambiar el precio vigente de "PLA Genérico" actualiza en menos de 5 s el precio publicado de todos los productos que lo usan (test de integración con el reloj controlado).
  - Hecho así: las 15 escrituras de §4.3 llevan `@AffectsPrices('<causa>')`; un interceptor global avisa al `PriceInputsBus` (rxjs) cuando el handler termina bien, así los módulos de costos no dependen de la tienda. `WebPriceRecalcService` escucha con debounce de 2 s (junta las causas), corre un recálculo a la vez, tiene el cron de 10 min y el botón `POST /web-catalog/prices/recompute`. Avisa `catalog.changed` con los slugs de las publicaciones afectadas. El reloj del debounce es inyectable (`RECALC_TIMER`) para el test. Agregar un producto a una publicación le calcula el precio en el momento.
- [ ] **F7·3 [t3d] Se ve el historial de precios de cada producto**
  - Para qué: saber cuándo y por qué cambió un precio.
  - Qué hacer: `GET /web-catalog/prices/:productId/history`.
  - Cierra cuando: el endpoint devuelve el precio actual y los últimos cambios con su causa (test). ~~el panel muestra los últimos cambios con su causa~~ → pasa a F8·4 (pestaña Publicación), que es donde está la pantalla.
  - Hecho así: devuelve estado, precio, motivo, fecha de cálculo y los últimos 50 cambios del más nuevo al más viejo (2026-10-28: el criterio de panel se movió a F8·4 porque la ficha de la publicación todavía no existe).
- [ ] **F7·4 [t3d] Un producto sin precio no se puede publicar y el panel dice por qué**
  - Para qué: que la tienda nunca muestre un producto sin precio.
  - Qué hacer: el listado de publicaciones marca las variantes sin precio y por qué ("Venta Directa deshabilitada", "La categoría no tiene markup").
  - Cierra cuando: un producto sin markup no se puede publicar y el mensaje dice cómo resolverlo.
  - Hecho así: los motivos de `NO_PRICE` dicen qué tocar ("…: cargalo en Categorías"). El checklist suma `detail` y el 422 nombra cada producto sin precio con su motivo. El listado (`GET /web-catalog/products`) trae `priceMin`/`priceMax`, `activeVariantCount` y `alerts` (`NO_PRICE`, `INACTIVE_COLOR`, `NO_IMAGES`, `NO_VARIANTS`), y cada miembro de la ficha su `priceState`, `price` y `priceReason`: F8·3 solo los muestra.

**Verificación:** verificación mínima de [t3d].

---

### F8 — Panel "Tienda online" · 24–36 h

> **Objetivo:** que el admin gestione toda la tienda desde tienda3d sin tocar la base. El punto de
> entrada es la ficha del producto, con el botón de visibilidad.

- [ ] **F8·1 [t3d] El panel tiene los componentes de interfaz que necesita la tienda**
  - Para qué: armar las pantallas nuevas con el mismo estilo que el resto del sistema.
  - Qué hacer: `components/ui/{dialog,tabs,switch,textarea,select,badge}.tsx`, con el mismo estilo que los existentes (cva y tokens de `theme/tokens.css`).
  - Cierra cuando: se usan en F8·2–F8·6, y `product-editor.tsx` puede seguir con sus nativos.
  - Hecho así: propios, como `confirm-dialog` y `checkbox` (sin sumar Radix): `Dialog` (Escape, clic afuera, foco atrapado y devuelto, z-80 debajo del confirm), `Tabs` (tablist/tab/tabpanel, flechas, Home/End, controlado o no), `Switch` (`role="switch"`), `Select` nativo con el estilo de `Input`, `Textarea` y `Badge` con cva (`success`, `warning`, `destructive`…). Se mergea antes de las pantallas para que F8·2–F8·6 los usen; el uso se verifica en cada una.
- [ ] **F8·2 [t3d] Desde la ficha del producto se publica u oculta en la tienda**
  - Para qué: gestionar la tienda desde el lugar donde ya se trabaja cada producto.
  - Qué hacer:
    - Crear `productos/[id]/product-web-section.tsx` y renderizarla en `productos/[id]/page.tsx`, debajo del editor. Es visible con `ecommerce:read` y editable con `ecommerce:write`, con su propio `useEditMode`.
    - Muestra: la publicación a la que pertenece y su estado, el **interruptor "Visible en la tienda"** (publica u oculta la publicación y muestra el checklist si falta algo), el precio publicado y su estado, el link al editor y "Ver en la tienda".
    - Si el producto no está publicado: botón **"Crear publicación con este producto"**, que precarga nombre y descripción.
  - Cierra cuando: desde la ficha de "Lina" se crea la publicación, se completa, se hace visible y se oculta, sin salir del flujo.
  - Hecho así: `GET /web-catalog/by-product/:productId` devuelve la publicación del producto (o null), su checklist y el precio publicado. La sección no usa `useEditMode`: el interruptor y "Crear publicación" actúan en el momento. Si falta algo, el interruptor queda deshabilitado y la sección lista qué falta y cómo resolverlo, con el link para completarla. Recorrido con Playwright en el ecosistema, sin errores: producto "Lámpara Lina" → crear publicación (precarga nombre y descripción) → colores, variantes y foto en el editor → visible → oculta ([captura](anexos/capturas/f8-2-ficha-visible.jpg)); el precio publicado coincide con el de Venta Directa del panel de precios. En [infra], `TSC_WATCHFILE=DynamicPriorityPolling` en la API de desarrollo: sin eso no veía los cambios de `@tienda3d/shared` y seguía con el código viejo.
- [ ] **F8·3 [t3d] El admin ve todas las publicaciones con sus alertas**
  - Para qué: detectar de un vistazo qué falta publicar o corregir.
  - Qué hacer: `/tienda-online/publicaciones` con foto, nombre, estado, rango de precio, variantes activas/total, alertas (sin precio, color inactivo, sin fotos) y filtro por estado.
  - Cierra cuando: las publicaciones se ven con sus alertas (probado con publicaciones de prueba en el ecosistema). ~~las 13 publicaciones migradas (F9) se ven con sus alertas~~ → pasa a la verificación de F9, que depende de D12.
  - Hecho así: `tienda-online/publicaciones` (lista con portada por el proxy de medios, estado, alertas, rango de precio y variantes activas/total; filtro por estado y búsqueda; alta en diálogo que lleva al editor de F8·4). `GET /web-catalog/products` suma `coverImagePath`. En el menú, "Resumen" se marca solo en su ruta exacta (`exact` en `NavItem`).
- [ ] **F8·4 [t3d] El admin arma una publicación completa: contenido, variantes, fotos y categorías**
  - Para qué: cargar y mantener un producto web sin tocar la base.
  - Qué hacer: `/tienda-online/publicaciones/[id]` con pestañas:
    - **Contenido**: nombre, slug, resumen, descripción con vista previa del formato simple y SEO.
    - **Variantes**: miembros con su etiqueta, opciones de color (línea, colores elegidos con swatches y piezas), atributos, matriz generada con edición en línea de activa, disponibilidad, stock, máximo y plazo.
    - **Fotos**: subir, arrastrar para ordenar, alt, asociar a un color y borrar con confirmación.
    - **Categorías**.
    - **Publicación**: checklist, historial de precios y link a la vista en el sitio.
  - Cierra cuando: se arma la Trapecio (2 productos del sistema, 4 colores, fotos por color) de punta a punta, y la pestaña Publicación muestra los últimos cambios de precio con su causa (criterio que viene de F7·3).
  - Hecho así: se hizo antes que F8·2, porque el criterio de F8·2 ("se completa…") necesita este editor. Recorrido automatizado con Playwright en el ecosistema (`sistema.localhost`), sin errores de consola: alta desde el listado, 2 productos del sistema con etiqueta "Tamaño", 4 colores, 8 variantes con SKU `-V01…-V04` por producto, 2 fotos asociadas a Blanco y Negro, descripción con vista previa, publicar (checklist completo) y ocultar; la pestaña Publicación muestra el historial de precios con su causa. Capturas: [variantes](anexos/capturas/f8-4-1-variantes.jpg), [fotos](anexos/capturas/f8-4-2-fotos.jpg), [publicación](anexos/capturas/f8-4-5-publicada.jpg). Al pasar se corrigió `formatDateTime` del panel: el formato es-AR por defecto es de 12 h sin "a. m./p. m." y las 13:14 se veían como 01:14 en todo el sistema (ahora `hourCycle: 'h23'`).
- [ ] **F8·5 [t3d] El admin organiza las categorías de la tienda**
  - Para qué: definir cómo se navega la vidriera.
  - Qué hacer: `/tienda-online/categorias` con árbol, alta y edición en diálogo, foto y orden.
  - Cierra cuando: se crea "Lámpara > Lámpara de mesa" con foto.
  - Hecho así: lista en árbol (madre y sus hijas con sangría) con foto, slug, cantidad de publicaciones y orden; alta y edición en `Dialog` (nombre, slug opcional, madre de primer nivel, descripción, orden, activa); foto por categoría con el mismo flujo de F6·4; borrar con confirmación (el 409 de la API explica por qué no). Recorrido con Playwright en el ecosistema, sin errores ([captura](anexos/capturas/f8-5-categorias.jpg)).
- [ ] **F8·6 [t3d] El admin cambia las condiciones de venta de la tienda**
  - Para qué: actualizar envíos, retiro y transferencia sin depender de un desarrollador.
  - Qué hacer: `/tienda-online/ajustes` (envíos, retiro, transferencia y email de avisos).
  - Cierra cuando: el formulario guarda y valida contra la API (recorrido en el ecosistema). ~~guardar cambia lo que muestra el checkout (después de F12)~~ → pasa a la verificación de F12, que es cuando el sitio lee `store_settings`.
  - Hecho así: formulario con `useEditMode` (Editar / Cancelar / Guardar) visible con `ecommerce:settings`; los montos se escriben como en Argentina ("4.500" son cuatro mil quinientos, "4.500,50" con decimales). Recorrido con Playwright: transferencia sin datos rechazada con el mensaje de la API, guardado y persistido al recargar ([captura](anexos/capturas/f8-6-ajustes.jpg)). Al pasar, `handleApiError` muestra el detalle de validación de la API cuando es un mensaje propio en castellano (antes solo "Validación fallida"); los mensajes por defecto de zod, en inglés, siguen mostrando el genérico.
- [ ] **F8·7 [t3d] Las pantallas de la tienda usan los mismos tipos que la API**
  - Para qué: que un cambio en la API que rompa el panel se detecte al compilar.
  - Qué hacer: las pantallas nuevas usan los DTOs de `packages/shared` y no los redeclaran.
  - Cierra cuando: `grep` no encuentra tipos `Web*Dto` declarados en `apps/web`.
  - Hecho así: no hay ninguno, y `pnpm verify` lo controla en cada corrida (paso "tipos de la tienda"): una declaración `interface Web…Dto` / `type Web…Dto =` (también `EcommerceSettingsDto` y `SystemProductWebDto`) en `apps/web` corta la verificación.

**Verificación:** verificación mínima de [t3d], y un recorrido manual del admin con capturas en la bitácora.

---

### F9 — Migración del catálogo actual · 6–10 h

> **Objetivo:** que todo lo que hoy muestra el sitio exista en el sistema, conciliado con la dueña.
> D12 definida el 2026-10-28. **F9·1 y F9·2 se corren solo en local** (OK de Pablo: la base de este
> equipo no es la del sistema en uso). **F9·3 espera el dump de la base real** (Camila), al final.

- [ ] **F9·1 [t3d] El sistema tiene cargados los colores que se venden hoy**
  - Para qué: ofrecer en la tienda los mismos colores que ya conocen los clientes.
  - Qué hacer: cargar como hijos de la línea que indique la dueña (por defecto "PLA Genérico") los colores de §4.8 que falten, con su `colorHex`, desde el panel de Insumos o con un script idempotente. La tienda no ofrece colores que no estén en el sistema (D12).
  - Cierra cuando: `GET /materials?type=FILAMENT` devuelve los 11 colores.
  - Hecho así: `scripts/store-colors.ts` (`pnpm store:colors [--line PLA-GENERICO] [--dry-run]`) con la lógica pura en `src/modules/catalog-import/store-colors.ts` (copiada en la imagen, para correrlo también en producción). Compara por nombre sin tildes ni mayúsculas; crea lo que falta como en el alta desde Insumos (hereda unidad y marca) y completa el código vacío; un código distinto o un color dado de baja los informa y no los toca. En el ecosistema, sobre la copia de la base local: 10 agregados y el Blanco ya estaba; la segunda corrida no cambia nada y `GET /materials?type=FILAMENT` devuelve los 11 en PLA Genérico. Al copiar la base apareció que el seed, que el ecosistema corre en cada arranque, pisaba los canales de sistema (renombró "Contado S/F" a "Efectivo") y agregaba el producto de demo: ahora solo asegura lo estructural de los canales y la demo va solo en una base sin productos (test en `prisma/seed.int-spec.ts`).
- [ ] **F9·2 [t3d] El catálogo actual de la web pasa al sistema sin perder nada**
  - Para qué: lanzar la tienda nueva con los mismos productos, fotos y textos.
  - Qué hacer:
    - `apps/api/scripts/import-storefront-catalog.ts` lee `storefront/prisma/seed/catalog.json` y `media/` y mapea por la tabla conciliada.
    - Crea publicaciones, miembros, opciones de color con los colores que tiene cada producto, atributos, variantes (con el SKU viejo en `legacySku`), fotos copiadas al volumen, categorías web, contenido y SEO.
    - Las disponibilidades se copian del storefront.
    - Opción `--dry-run` con reporte. Es idempotente (vuelve a correr sin duplicar).
  - Cierra cuando: el dry-run no tiene errores, y la importación deja publicaciones y variantes equivalentes a §4.8 (13 y 52, salvo lo que cambie la conciliación).
  - Hecho así: la lógica pura en `src/modules/catalog-import/storefront-catalog.ts` (formato de `catalog.json` copiado del sitio, plan por publicación y sus errores) y la tabla conciliada de §4.8 en `catalog-mapping.ts`, que es lo que se edita en F9·3. `StorefrontCatalogImporter` crea todo con los servicios del panel (reglas, auditoría, precios y avisos): miembros, opción de color de la línea de F9·1, opciones informativas, variantes regeneradas y emparejadas con las de la web (disponibilidad según D9, stock, tope por pedido, foto y SKU viejo en `legacySku`), fotos en orden con su texto alternativo y, si solo las usa un color, atadas a ese color, y categorías (se reusan por slug). Idempotente: no toca una publicación que ya existe con ese slug (actual o viejo); si una falla a mitad de camino se borra entera, con sus fotos. Termina oculta si pasa el checklist (sin pasar por la tienda: `publishedAt` queda para la primera publicación real, F12) y en borrador si no. El comando vive en `src/` (`import-storefront-catalog.cli.ts`) y no en `scripts/`, porque necesita la app compilada: tsx no emite la metadata de decoradores que usa la inyección de Nest, y así corre también en la imagen de producción (F20·1 repite F9): `node dist/modules/catalog-import/import-storefront-catalog.cli.js --from <seed> [--dry-run]`. En el ecosistema, sobre la copia de la base local: la simulación sin errores y la importación dejó 13 publicaciones (11 ocultas y listas, 2 en borrador), 48 variantes (las 52 de la web menos las 4 de Noche/Día y Riso, que no tienen producto en el sistema y quedan con contenido y fotos para F9·3), 64 fotos (11 atadas a un color) y 5 categorías; la segunda corrida no cambia nada ([captura](anexos/capturas/f9-2-publicaciones.jpg)). Peso y medidas de la web no se importan: el envío es tarifa plana (F5·8).
- [ ] **F9·3 [t3d] La dueña ve cómo cambia cada precio antes de publicar**
  - Para qué: ajustar markups en el sistema si algún precio nuevo no le cierra.
  - Qué hacer:
    - **Al final, con el dump de la base real del sistema** (lo pide Pablo a Camila): restaurarlo en el ecosistema, volver a correr F9·1 y F9·2 contra esos datos y conciliar las diferencias de §4.8 (TPK/PTK, Noche/Día, Riso, 380/390).
    - Comparar por variante el precio web actual contra el precio publicado nuevo (Venta Directa), con la diferencia en pesos y en porcentaje.
  - Cierra cuando: el reporte está entregado y la dueña confirma o pide ajustar markups o categorías **en el sistema** (no en la web).

**Verificación:** recorrido del panel con las 13 publicaciones en estado `HIDDEN`, y el listado de F8·3 las muestra con sus alertas (criterio que viene de F8·3). Se publican recién en F12.

---

### F10 — Contrato de lectura · 8–12 h

> **Objetivo:** que el sitio pueda leer solo lo publicado, con un usuario que no puede ver ni
> escribir nada más (T3).

- [ ] **F10·1 [t3d] El sitio ve solo lo publicado, a través de vistas**
  - Para qué: que la tienda no pueda leer costos, proveedores ni datos internos.
  - Qué hacer: migración SQL con las vistas de §5.4, `WITH (security_barrier)`, filtrando `status = 'PUBLISHED'`, producto del sistema activo, miembro activo, opción de color activa con sus colores activos en Insumos (F5·3) y precio `OK`. Montos en centavos (`(price * 100)::int`).
  - Cierra cuando: la migración aplica en limpio, y una publicación oculta, un producto archivado, una variante con un color inactivo o una variante sin precio no aparecen.
  - Hecho así: migración SQL `storefront_v1_views` con las ocho vistas de §5.4 (`security_barrier`). Semántica: `products` exige al menos una variante a la venta; `variants` filtra también opción de color y atributo inactivos o un color que salió de la opción; `member_value_key` es el id del miembro; `available_quantity` es el stock (null si es a pedido); `max_per_order` toma 20 por defecto; `sort` numera las variantes de cada publicación; `variant_options` incluye el tamaño solo si hay más de uno a la venta (los atributos usan el slug del valor como clave); una categoría hija se ve si su madre está activa; `store_settings` siempre devuelve una fila. Prisma no ve drift (las vistas viven fuera de `public`). Test `storefront-views.int-spec.ts` con el dueño de la base; el lector se prueba en F10·3.
- [ ] **F10·2 [t3d] El usuario de lectura del sitio queda configurado en cada migración**
  - Para qué: que una actualización del sistema no corte la lectura de la tienda.
  - Qué hacer: `db/grants.sql` idempotente, corrido por `tienda3d-migrate` después de `migrate deploy`, con `GRANT USAGE` + `SELECT ON ALL TABLES IN SCHEMA storefront_v1` y los ajustes del rol de §5.3. El rol lo crea el init de infra (F3·2); los tests lo crean en su setup.
  - Cierra cuando: después de una migración nueva, el lector sigue leyendo sin pasos manuales.
  - Hecho así: `prisma/grants-reader.sql` (al lado de `grants.sql`, no en `db/`): `USAGE` + `SELECT` en `storefront_v1`, default privileges para las vistas nuevas y `REVOKE` de todo `public`. `scripts/migrate.sh` lo aplica si está `READER_DB_ROLE` (en [infra], `tienda3d-migrate` lo pasa). Los tests crean `storefront_reader_test` con los mismos ajustes de rol y prueban que una vista nueva se lee sin tocar nada y que una recreada vuelve a leerse al reaplicar. En el ecosistema, como `storefront_reader`: `search_path = storefront_v1`, lee las vistas y `public` da _permission denied_.
- [ ] **F10·3 [t3d] Hay pruebas automáticas de que el usuario de lectura no ve nada más**
  - Para qué: detectar cualquier fuga de datos antes de que llegue a producción.
  - Qué hacer: `apps/api/test/storefront-contract.int-spec.ts` conecta como `storefront_reader` y verifica:
    - (a) puede leer cada vista;
    - (b) `SELECT` en `public.users`, `public.supplier_materials`, `public.customers`, `public.quotes` y `public.web_products` da _permission denied_;
    - (c) `INSERT`/`UPDATE` fallan;
    - (d) las columnas de cada vista coinciden con un snapshot;
    - (e) lo oculto no aparece.
  - Cierra cuando: los tests están en verde en `pnpm verify`.
  - Hecho así: `test/storefront-contract.int-spec.ts` como `storefront_reader_test`: (a) lee las ocho vistas sin calificar el esquema (search*path); (b) \_permission denied* en `users`, `supplier_materials`, `customers`, `quotes`, `web_products` y `web_prices`; (c) no escribe ni en tablas ni a través de vistas, ni crea objetos; (d) las columnas y tipos de cada vista están escritos en el test (no un snapshot autogenerado, para que cambiar el contrato sea explícito); (e) un borrador listo para vender no aparece, publicado sí y oculto de nuevo no.
- [ ] **F10·4 [t3d][sf] El contrato de lectura está documentado**
  - Para qué: que el sitio pueda evolucionar leyendo solo ese documento.
  - Qué hacer: escribir `docs/contrato-storefront-v1.md` (vistas, columnas, semántica, versionado y vectores de prueba de la firma de F11) y reemplazar `storefront/docs/integracion-tienda3d.md` por un link a él.
  - Cierra cuando: el documento cubre conexión, las ocho vistas con columnas y semántica, versionado y los vectores de la firma, y el doc viejo del sitio apunta a él. ~~el storefront implementa F12 leyendo solo ese documento~~ → pasa a la verificación de F12.
  - Hecho así: [docs/contrato-storefront-v1.md](../contrato-storefront-v1.md). Los vectores de prueba de la firma se calcularon con Node y se verificaron con openssl (uno con tildes fija UTF-8). En [sf], `storefront/docs/integracion-tienda3d.md` apunta al contrato y el README también.

**Verificación:** verificación mínima de [t3d], incluidos los tests de contrato.

---

### F11 — Integración entre sistemas · 12–18 h

> **Objetivo:** que los dos sistemas se hablen de forma autenticada, firmada, idempotente y con
> reintentos (§5.5).

- [ ] **F11·1 [t3d] Solo el sitio puede llamar a la API de integración del sistema**
  - Para qué: que nadie más pueda registrar pedidos ni clientes en el sistema.
  - Qué hacer:
    - Tabla `integration_clients` y guard `IntegrationAuthGuard` (Bearer, SHA-256, `timingSafeEqual`, alcances), con throttler propio.
    - Comando `pnpm integration:issue-key <nombre>` que imprime la clave una sola vez, y `integration:revoke`.
    - Rutas bajo `/api/integrations/storefront/v1`.
    - El proxy de `apps/web` devuelve 404 para `/api/integrations/*`.
  - Cierra cuando: sin clave da 401, con clave revocada da 401, con alcance insuficiente da 403, y por `sistema.localhost` da 404.
  - Hecho así: modelo `IntegrationClient` (hash SHA-256, prefijo para reconocerla, alcances, `lastUsedAt` cada minuto como mucho, `revokedAt`); `IntegrationAuthGuard` compara contra todas las claves activas en tiempo constante; `@IntegrationScopes(...)` reemplaza a `@Permissions` y `route-permissions.spec` exige que vivan bajo `/integrations`; cupo propio de 600/min. Comando `scripts/integration-key.ts` (`issue`, `register` desde stdin para el secreto `storefront_api_key` de infra, `revoke`, `list`), copiado en la imagen. Primera ruta: `GET /integrations/storefront/v1/ping`. Probado en el ecosistema: por la red interna con clave 200 y sin clave 401; por `sistema.localhost` y `tienda.localhost`, 404. En desarrollo, un cambio del schema de Prisma necesita reiniciar `tienda3d-api` (el cliente se genera al arrancar).
- [ ] **F11·2 [t3d][sf] Los avisos entre los sistemas van firmados**
  - Para qué: que un aviso falso o repetido no cambie un pedido.
  - Qué hacer: funciones `signEvent` / `verifyEvent` en cada repo (formato de §5.5), con los mismos vectores de prueba del documento de contrato.
  - Cierra cuando: los dos repos pasan los mismos vectores.
  - Hecho así: `apps/api/src/common/integration-auth/event-signature.ts` y `storefront/src/server/events/signature.ts`, idénticas: `verifyEvent` devuelve el motivo (`missing`, `malformed`, `stale`, `bad-signature`), acepta varios secretos para rotar y compara en tiempo constante. Los dos tests usan los tres vectores del contrato, más cuerpo alterado, otro secreto, ventana de ±300 s y rotación.
- [ ] **F11·3 [t3d] Los avisos del sistema al sitio se reintentan hasta llegar**
  - Para qué: que un corte del sitio no haga perder un cambio de estado.
  - Qué hacer:
    - Tabla `outbox_events`. La escritura del evento va en la misma transacción que el cambio.
    - Reemplazar `NoopCatalogEvents` (F5·7) por el escritor del outbox, y emitir `catalog.changed` también desde los cambios a publicaciones publicadas (contenido, slug con el viejo incluido, miembros, opciones, variantes, categorías, fotos) y de los ajustes (`scope: 'settings'`).
    - Despachador con `@nestjs/schedule` cada 15 s, con backoff y `lastError`.
    - Alerta en el panel si un evento lleva más de 1 h sin entregarse.
  - Cierra cuando: con el storefront apagado, un `catalog.changed` queda pendiente y se entrega al prenderlo.
  - Hecho así: modelo `OutboxEvent` (id uuid = `X-TP-Event-Id`, intentos, próximo intento, último error, entregado, abandonado). `OutboxCatalogEvents` reemplaza al no-op y escribe en la transacción del cambio; `CatalogEvents.productChanged` avisa solo si la publicación está publicada (con el slug viejo si cambió) y lo llaman miembros, contenido, opciones, atributos, variantes, fotos y categorías de la publicación; las categorías avisan `scope: 'catalog'`, igual que el recálculo de precios disparado por un cambio del sistema (cubre también un producto archivado o un color desactivado). `OutboxDispatcher` cada 15 s, cuerpo `{"event": tipo, ...payload}` firmado con F11·2, backoff 30 s→1 h y abandono a las 48 h; sin `EVENTS_SECRET_T3D_TO_SF` no manda nada. Alerta en el layout de la tienda (`GET /web-catalog/outbox`) si hay avisos de más de 1 h o abandonados. Test con un receptor HTTP real que se apaga y se prende. En el ecosistema el aviso sale firmado y queda en reintento con `HTTP 404` hasta que el sitio tenga el receptor (F11·5).
- [ ] **F11·4 [t3d] El sistema no procesa dos veces el mismo aviso**
  - Para qué: que un reintento no duplique pedidos ni clientes.
  - Qué hacer: tabla `inbound_events`. Los endpoints de §5.5 deduplican por `eventId` o `externalId`.
  - Cierra cuando: mandar dos veces el mismo evento produce un solo efecto (test).
  - Hecho así: tabla `inbound_events` (`source` + `key` únicos, respuesta guardada) e `InboundEventsService.once(fuente, clave, efecto)`, global: reserva la clave y aplica el efecto en la misma transacción. Un reintento devuelve la respuesta guardada; dos llamadas simultáneas dan un solo efecto (la segunda espera el índice único); si el efecto falla, la clave no queda tomada. Los endpoints de §5.5 (F13–F15) lo usan con `eventId` o `externalId`.
- [ ] **F11·5 [sf][infra] El sitio recibe avisos y reintenta los suyos**
  - Para qué: que del lado del sitio tampoco se pierda ni se duplique nada.
  - Qué hacer:
    - `src/app/api/internal/events/route.ts` (verifica firma y ventana, deduplica en `inbound_events`).
    - Worker `src/worker/index.ts` (mismo `Dockerfile`, comando `node dist/worker.js` o `pnpm worker`) con su outbox, el envío de mails pendientes y la limpieza de sesiones y tokens vencidos.
    - Servicio `storefront-worker` en el compose de infra.
  - Cierra cuando: con tienda3d apagado, un `customer.upserted` queda pendiente y se entrega al prenderlo; una firma inválida da 401.
  - Hecho así: en [sf], tablas `inbound_events` (dedup por `X-TP-Event-Id`) y `outbox_events` (llamadas a la API de integración con `Idempotency-Key`), `POST /api/internal/events` (firma y ventana de F11·2 con `src/domain/inbound-event.ts`; un tipo desconocido se confirma y se ignora; si el manejador falla no se registra y tienda3d reintenta), `enqueueCall(tx, …)` para F13–F15 y el worker `pnpm worker` (`src/worker/`, sin `server-only`: su propio cliente de base) que entrega con la clave del sitio, con el backoff de `src/domain/outbox.ts`, y borra sesiones del panel vencidas. La firma pasó a `src/domain/event-signature.ts` (es pura). En [infra], servicio `storefront-worker` (imagen `tools`; en desarrollo, el código montado), `EVENTS_SECRET_T3D_TO_SF_FILE` en el sitio y `STOREFRONT_API_KEY_FILE` en `tienda3d-migrate`, que registra su hash con `integration-key.ts register` ([t3d] `migrate.sh`). El `customer.upserted` se probó contra un tienda3d de mentira que se apaga y se prende (el endpoint real llega en F13). Los mails pendientes pasan al worker con los pedidos (F14): hoy el sitio los manda en el momento.
- [ ] **F11·6 [sf] Un cambio en el panel se ve en la tienda en segundos**
  - Para qué: que lo publicado sea lo que ve el cliente.
  - Qué hacer: `catalog.changed` → `revalidateTag(CATALOG_TAG | productTag(slug) | SETTINGS_TAG)`, con un `cacheLife` de respaldo de 5 minutos.
  - Cierra cuando: un cambio en el panel se ve en el sitio en menos de 5 s.

**Verificación:** verificación mínima de los dos repos, más una prueba manual con el ecosistema y un
contenedor apagado.

---

### F12 — El sitio lee el catálogo del sistema · 12–18 h

> **Objetivo:** que el storefront muestre solo lo que publica el sistema, sin catálogo ni panel
> propios (T2, T3).

- [ ] **F12·1 [sf] El sitio lee el catálogo del sistema**
  - Para qué: tener la base para que la tienda muestre lo que publica el sistema.
  - Qué hacer:
    - `src/server/catalog/reader.ts`, con un `pg.Pool` separado (`TIENDA3D_READER_URL` desde archivo y un máximo de 5 conexiones).
    - Consultas a las vistas con validación zod en el borde.
    - Mapeo a los tipos existentes (`ProductView`, `ProductCardView`, opciones y valores), donde miembros, colores y atributos se vuelven opciones.
  - Cierra cuando: hay tests unitarios del mapeo con filas de ejemplo (Trapecio y un cuaderno con atributos).
  - Hecho así: hecho leyendo solo el contrato. En [sf], `src/domain/storefront-v1.ts` tiene los esquemas zod de las ocho vistas y el mapeo puro a `ProductView`, `ProductCardView` y `CategoryView`: las opciones salen de `variant_options` agrupadas por `option_key` (el tamaño primero, después los colores y las informativas, en el orden del sistema), y la disponibilidad sigue la tabla D9 (`MADE_TO_ORDER` se muestra como "Se fabrica a pedido"). Las fotos se sirven en `/media/<path>` (F12·3), y la de categoría va sin medidas porque se muestra con `fill`. `src/server/catalog/reader.ts` usa un `pg.Pool` propio (máximo 5, `TIENDA3D_READER_URL` o `_FILE`), valida cada fila en el borde (si una vista no cumple el contrato, el error lo dice) y lee los `timestamp` como UTC. Tests con filas de una Trapecio (dos tamaños y colores) y un cuaderno con "Tipo de hoja". Además, con la Trapecio y el Army publicados en el ecosistema, las ocho vistas reales pasan los esquemas como `storefront_reader` y el mapeo arma sus tarjetas y fichas.
- [ ] **F12·2 [sf] Las páginas de la tienda muestran lo publicado en el sistema**
  - Para qué: un solo catálogo para el sistema y la web.
  - Qué hacer: `server/catalog/queries.ts` y `server/settings.ts` pasan a leer las vistas, manteniendo `"use cache"` + `cacheTag` y leyendo primero los datos dinámicos (regla de Cache Components del `CLAUDE.md`).
  - Cierra cuando: `pnpm build` funciona sin base, y las páginas de tienda, categoría y producto muestran lo publicado.
  - Hecho así: `getProductCards`, `getProduct`, `getCategories` y `getStoreSettings` mantienen su firma y su `"use cache"` + `cacheTag`, pero leen las vistas con el lector de F12·1; la caché vence a los 5 minutos (`CATALOG_CACHE`), el respaldo del contrato por si se pierde un aviso. La ficha usa `seo_title`/`seo_description` cuando hay. En [infra], el sitio recibe `TIENDA3D_READER_URL_FILE` (secreto `storefront_reader_database_url`). `pnpm build` pasa sin ninguna base configurada. En el ecosistema, con la Trapecio y el Army publicados, `/tienda/`, las categorías, las fichas y el sitemap muestran solo esas dos; una publicación oculta da el 404 de la tienda. Hasta F12·6 el carrito sigue con las variantes propias del sitio, y hasta F12·5 el `docker compose` suelto de [sf] no tiene catálogo (necesita el ecosistema).
- [ ] **F12·3 [sf] La tienda muestra las fotos que se suben en el sistema**
  - Para qué: cargar cada foto una sola vez.
  - Qué hacer: `/media/[...path]` lee de `MEDIA_DIR` (montado `:ro`) con `Cache-Control` largo y `next/image` sobre esas rutas.
  - Cierra cuando: las fotos subidas en el panel se ven en el sitio.
  - Hecho así: `/media/catalog/<id>/<uuid>.webp` y `/media/categories/<id>/<uuid>.webp` se leen de `MEDIA_DIR` (el volumen `media`, montado `:ro`, que [infra] ya pasaba) con `Cache-Control: public, max-age=31536000, immutable`; la ruta se valida con una regla pura (`src/domain/media.ts`: tres segmentos, carpeta conocida, solo `.webp`) y `realpath` impide salir del volumen. Las rutas de dos segmentos siguen sirviendo las fotos propias del sitio hasta que se borre su panel (F12·5). `next/image` las optimiza sin configuración extra. Probado en el ecosistema: una foto subida al Army desde la API del panel se sirvió en el sitio en el momento y dio 404 al borrarla; la ficha de la Trapecio muestra sus fotos, sin errores en la consola.
- [ ] **F12·4 [sf] Un link viejo a un producto sigue funcionando después de cambiarle el nombre**
  - Para qué: no perder visitas ni posicionamiento en Google.
  - Qué hacer: un slug que figura en `slug_redirects` responde 308 al nuevo.
  - Cierra cuando: cambiar el slug en el panel no rompe el link viejo.
- [ ] **F12·5 [sf] El sitio deja de tener catálogo y panel propios**
  - Para qué: que no haya dos lugares donde editar un producto.
  - Qué hacer:
    - Borrar las rutas `/admin`, `server/actions/admin/*`, `server/admin/*`, `server/auth/session.ts` y los modelos `AdminUser`/`AdminSession`.
    - Borrar los modelos de catálogo y `StoreSettings`, el seed de catálogo y `scripts/import-woocommerce.ts`.
    - Hacerlo con una migración Prisma que borra las tablas, **sin reset**.
    - Redirigir `/admin/*` y `/wp-admin` a la home.
    - Actualizar el README y el `CLAUDE.md` del repo.
  - Cierra cuando: `grep -r "requireAdmin\|AdminUser" src` no devuelve nada, y typecheck, lint y tests están en verde.
- [ ] **F12·6 [sf] El carrito usa los precios y la disponibilidad del sistema**
  - Para qué: que el cliente nunca pague un precio viejo ni compre algo oculto.
  - Qué hacer: las líneas guardan ids de `storefront_v1.variants`, y precio, disponibilidad y máximo salen de la vista (D3: precio de cantidad 1).
  - Cierra cuando: ocultar un producto en el panel lo saca del carrito con aviso ("ya no está disponible").

**Verificación:** verificación mínima de [sf], y e2e de catálogo y carrito adaptadas al ecosistema. Además, cambiar un ajuste en `/tienda-online/ajustes` cambia lo que muestra el checkout (criterio que viene de F8·6), y la lectura del catálogo se implementa leyendo solo `docs/contrato-storefront-v1.md` (criterio que viene de F10·4).
Publicar las 13 publicaciones migradas y comparar contra el sitio de hoy.

---

### F13 — Cuentas de cliente · 20–30 h

> **Objetivo:** que para comprar haya que tener una cuenta, y que la cuenta guarde todas las compras (T6).

- [ ] **F13·1 [sf] El sitio guarda cuentas de cliente**
  - Para qué: tener la base para comprar con cuenta y ver el historial.
  - Qué hacer:
    - `Customer`: `id` uuid, `email` único normalizado, `passwordHash` (scrypt de `server/auth/password.ts`), nombre, apellido, teléfono, documento opcional, `emailVerifiedAt`, `failedLoginAttempts`, `lockedUntil`, `acceptedTermsAt`, `createdAt` y `lastLoginAt`.
    - `CustomerSession` (hash del token, vencimiento, último uso).
    - `CustomerEmailToken` (`VERIFY`/`RESET`, hash, vencimiento, `usedAt`).
    - `CustomerAddress`.
  - Cierra cuando: la migración aplica y hay tests del dominio de tokens.
- [ ] **F13·2 [sf] El cliente se registra y verifica su email**
  - Para qué: que cada compra tenga un email real para los avisos (D5).
  - Qué hacer:
    - `/mi-cuenta/registro` con aceptación de términos y privacidad.
    - Mail con link de un uso válido 24 h; `/mi-cuenta/verificar`.
    - Reenvío limitado a 3 por hora.
    - El registro no revela si el email ya existe ("Si el email no estaba registrado, te mandamos un link").
  - Cierra cuando: e2e de registro → mail en Mailpit → verificación.
- [ ] **F13·3 [sf] El cliente ingresa a su cuenta de forma segura**
  - Para qué: proteger las cuentas de intentos de adivinar contraseñas.
  - Qué hacer:
    - `/mi-cuenta/ingresar`.
    - Cookie `tp_session`: `httpOnly`, `Secure` en producción, `SameSite=Lax`, 30 días con renovación por uso, token rotado al ingresar.
    - Bloqueo de 15 min tras 8 intentos fallidos (como tienda3d), más límite por IP y por email (`server/rate-limit.ts`).
    - Mensajes genéricos y `/mi-cuenta/salir`.
  - Cierra cuando: hay tests de bloqueo, rotación y vencimiento.
- [ ] **F13·4 [sf] El cliente recupera su contraseña por email**
  - Para qué: no perder clientes que se olvidaron la clave.
  - Qué hacer: `/mi-cuenta/olvide-mi-clave` → link de 1 h → `/mi-cuenta/restablecer`, que cierra todas las sesiones.
  - Cierra cuando: un link usado o vencido no funciona (test).
- [ ] **F13·5 [sf] El cliente ve sus compras y sus datos en Mi cuenta**
  - Para qué: consultar cómo va cada compra sin escribirle a la tienda.
  - Qué hacer:
    - `/mi-cuenta` (resumen), `/mi-cuenta/compras` (lista), `/mi-cuenta/compras/[numero]` (detalle con estados, seguimiento e historial), `/mi-cuenta/datos`, `/mi-cuenta/direcciones` y cambio de contraseña (cierra las otras sesiones).
    - Quitar la redirección heredada `/mi-cuenta/* → /tienda/` de `next.config.ts`: se reusa la URL que tenía WordPress.
    - Proteger `/mi-cuenta/*` en `src/proxy.ts`.
  - Cierra cuando: un cliente ve solo sus compras; pedir la de otro devuelve 404.
- [ ] **F13·6 [sf] Para comprar hay que tener cuenta**
  - Para qué: que cada compra quede en el historial de un cliente identificado.
  - Qué hacer:
    - Sin sesión, `/finalizar-compra` lleva a `/mi-cuenta/ingresar?volver=/finalizar-compra` (con link a registro). El carrito sigue en la cookie.
    - Con sesión pero sin email verificado, pide verificar.
    - Prellenar con los datos y las direcciones.
  - Cierra cuando: e2e muestra que sin cuenta no se puede comprar y que el carrito sobrevive al ingreso.
- [ ] **F13·7 [sf] El sitio cumple con la ley de datos personales**
  - Para qué: informar cómo se usan los datos y permitir pedir la baja.
  - Qué hacer: página de política de privacidad (texto a acordar con la dueña), consentimiento registrado y "Pedir la baja de mi cuenta" (en v1, por mail a la tienda).
  - Cierra cuando: la página está publicada y enlazada en el registro y en el footer.
- [ ] **F13·8 [sf][t3d] Cada cliente de la web aparece en Clientes del sistema**
  - Para qué: que el taller vea quién compra, con su historial (D4).
  - Qué hacer:
    - [sf] `customer.upserted` por outbox al registrarse y al cambiar datos (solo nombre, email, teléfono y documento).
    - [t3d] `POST /customers` de la API de integración: crea o actualiza un `Customer` tipo `STANDARD` con `source = WEB` y `externalId`; si el email ya es de un cliente existente, lo vincula (D4).
    - [t3d] Filtro por origen en `/clientes`.
  - Cierra cuando: un cliente que se registra en el sitio aparece en Clientes del sistema con origen web, y uno cuyo email ya existía queda vinculado al cliente existente (test).

**Verificación:** verificación mínima de [sf] y e2e de cuentas.

---

### F14 — Pedidos de punta a punta · 30–45 h

> **Objetivo:** que el sitio guarde cada compra, el sistema la registre y el admin la gestione, y que
> el cliente vea cada cambio (T4).

- [ ] **F14·1 [sf] Cada compra guarda qué se pagó y en qué etapa de preparación está**
  - Para qué: separar el pago de la preparación, cada uno con su responsable.
  - Qué hacer:
    - Migración de `Order`: `customerId` obligatorio, `paymentStatus` + `fulfillmentStatus` (§5.6) en lugar de `status`, y `systemCode`.
    - `OrderItem` con snapshot: `webVariantId`, `sku`, `systemProductId`, nombre, etiqueta de la variante, colores elegidos `{línea: {id, nombre, hex}}`, atributos y precio unitario.
    - Portar `domain/orders.ts` a los dos ejes.
  - Cierra cuando: hay tests de dominio de las transiciones de cada eje.
- [ ] **F14·2 [t3d] El sistema registra los pedidos de la web con un código propio**
  - Para qué: gestionar los pedidos web junto al resto del trabajo del taller.
  - Qué hacer:
    - En `Customer`: campos `source` (`SYSTEM` | `WEB`) y `externalId` (único, opcional) para los clientes de la web (D4).
    - `WebOrder` (vinculado a `Customer`), `WebOrderItem` (con `webVariantId`, `productId`, `colorSelections` y `productionOrderId?`) y `WebOrderEvent`.
    - Código `W-AAAA-NNNN` con `DocumentCodeService` (scope `WEB_ORDER:W`), usando el año de Argentina.
  - Cierra cuando: la migración aplica y hay un test del código correlativo.
- [ ] **F14·3 [t3d][sf] Un pedido se confirma solo si el sistema valida precio y stock**
  - Para qué: no vender a un precio viejo ni más unidades de las que hay (D2).
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
- [ ] **F14·4 [sf] El cliente paga por transferencia**
  - Para qué: poder vender antes de conectar Mercado Pago (D7).
  - Qué hacer: la transferencia muestra las instrucciones de los ajustes y deja el pedido en `AWAITING_TRANSFER`. El pago simulado solo existe en local (ya validado en `env.ts`).
  - Cierra cuando: e2e completa con transferencia en el ecosistema.
- [ ] **F14·5 [t3d] El admin gestiona los pedidos web desde el sistema**
  - Para qué: confirmar pagos, preparar, enviar y cancelar desde un solo lugar.
  - Qué hacer:
    - `/tienda-online/pedidos`: lista con filtros (estado, pago, fecha, entrega) y contador de nuevos en el menú.
    - `/tienda-online/pedidos/[id]`: cliente, entrega, ítems con colores (swatches) y atributos, pago, historial y notas internas.
    - Acciones: confirmar transferencia, preparar, listo para retirar, enviado (con seguimiento), entregado y cancelar (pide motivo y libera stock).
  - Cierra cuando: cada acción respeta §5.6 (tests de API) y queda en auditoría.
- [ ] **F14·6 [t3d][sf] El cliente ve cada cambio de su pedido y recibe un mail**
  - Para qué: que no tenga que preguntar cómo va su compra.
  - Qué hacer:
    - [t3d] Emitir `order.fulfillment_changed` y `order.payment_confirmed_manually` por outbox.
    - [sf] Aplicarlos, sumarlos al historial y mandar el mail correspondiente.
  - Cierra cuando: un cambio en el panel se ve en "Mis compras" en menos de 30 s, con el mail en Mailpit.
- [ ] **F14·7 [t3d] Desde un pedido se genera su orden de producción con los colores elegidos**
  - Para qué: fabricar exactamente lo que pidió el cliente sin volver a cargarlo.
  - Qué hacer: botón "Generar orden de producción" en el ítem, que precarga producto, cantidad y `filamentOverrides`, armados con las piezas de cada opción de color y el color elegido. Vincula el ítem con la orden. Requiere F2·3 y F2·5.
  - Cierra cuando: la orden generada para una Trapecio Marrón 280 tiene el color Marrón en todas sus piezas de PLA.
- [ ] **F14·8 [t3d] El admin ve los pedidos web de cada cliente**
  - Para qué: conocer a quién compra por la web y cuánto.
  - Qué hacer: pestaña **Pedidos web** en el detalle de `/clientes/[id]` y columna con la cantidad de pedidos web en el listado. El precio de esos pedidos sigue siendo el publicado (D4).
  - Cierra cuando: un cliente con dos compras las muestra a las dos.
- [ ] **F14·9 [sf] El cliente y la tienda reciben los mails de cada pedido**
  - Para qué: avisos automáticos en cada paso de la compra.
  - Qué hacer: portar y ajustar `server/mail/templates.ts` (pedido recibido con instrucciones de transferencia, pago confirmado, cada cambio de preparación y cancelación) y el aviso de pedido nuevo a `notification_email`.
  - Cierra cuando: e2e encuentra los mails en Mailpit con el número y el código correctos.

**Verificación:** verificación mínima de los dos repos. E2e del ecosistema: compra → panel → confirmar
transferencia → preparar → listo → cliente ve los estados y recibe 4 mails. Cancelar libera stock.

---

### F15 — Solicitudes de personalización · 10–15 h

> **Objetivo:** que las solicitudes del formulario "Personalización" lleguen al sistema y se puedan
> convertir en una cotización a medida.

- [ ] **F15·1 [sf] El cliente pide una personalización desde su cuenta**
  - Para qué: que cada pedido de cotización quede asociado a un cliente y se pueda seguir.
  - Qué hacer:
    - `/personalizacion` pide sesión (D16): sin cuenta lleva a ingresar o registrarse y vuelve al formulario; con cuenta, precarga nombre, email y teléfono.
    - La solicitud se guarda vinculada al cliente, con su adjunto en `sf-private`, y crea un evento `quote_request.created` en el outbox.
    - El worker la entrega como multipart y, al confirmarse la entrega, borra el adjunto local.
  - Cierra cuando: sin sesión no se puede enviar; con tienda3d apagado, la solicitud llega al prenderlo.
- [ ] **F15·2 [t3d] El sistema recibe las solicitudes con su archivo adjunto**
  - Para qué: tener en el taller la idea y el archivo del cliente.
  - Qué hacer: `WebQuoteRequest` vinculada al `Customer` del cliente (por `externalId`), con el adjunto en `t3d-private` (mismas validaciones que en `domain/quotes.ts`: extensiones y 20 MB) y deduplicación por id.
  - Cierra cuando: hay tests de duplicado y de adjunto inválido.
- [ ] **F15·3 [t3d] Una solicitud se convierte en cotización a medida**
  - Para qué: cotizar sin volver a cargar los datos del cliente.
  - Qué hacer: `/tienda-online/solicitudes` (lista, estado, nota y descarga del adjunto con `ecommerce:orders`) y el botón **"Crear cotización a medida"**, que abre `/cotizaciones/nueva-a-medida` con el nombre, el contacto y la idea precargados.
  - Cierra cuando: de una solicitud sale una cotización `R-AAAA-NNNN` vinculada a la solicitud y al cliente.
- [ ] **F15·4 [sf][t3d] El cliente ve el estado de sus solicitudes en Mi cuenta**
  - Para qué: que sepa si su pedido de personalización está en análisis o ya fue cotizado, sin preguntar.
  - Qué hacer:
    - [t3d] Emitir `quote_request.status_changed` por outbox cuando el admin cambia el estado de una solicitud (nueva, en análisis, cotizada, descartada).
    - [sf] `/mi-cuenta/solicitudes` con la lista, el estado y la fecha de cada una.
  - Cierra cuando: un cambio de estado en el panel se ve en Mi cuenta en menos de 30 s.

**Verificación:** e2e del formulario hasta el panel y de vuelta a Mi cuenta.

---

### F16 — Prueba integral local y decisión · 12–18 h

> **Objetivo:** demostrar que el ecosistema funciona completo y seguro en local, y tener los datos
> para decidir el despliegue.

- [ ] **F16·1 [infra][sf] El ecosistema completo pasa sus pruebas de punta a punta**
  - Para qué: saber que todo funciona junto antes de decidir el despliegue.
  - Qué hacer: suite Playwright en [infra] (o en [sf] con una URL configurable) contra el perfil de producción:
    - catálogo: publicar, ocultar y cambiar precio;
    - cuentas;
    - compra completa;
    - panel;
    - solicitud de personalización;
    - caídas: tienda3d apagado durante el checkout (mensaje claro) y storefront apagado durante un cambio de estado (llega al volver).
  - Cierra cuando: la suite está en verde dos veces seguidas desde un ecosistema limpio.
- [ ] **F16·2 [infra] El ecosistema pasa una revisión de seguridad**
  - Para qué: no exponer datos ni rutas internas al publicarlo.
  - Qué hacer:
    - Tests de contrato del lector (F10·3).
    - `docker inspect` sin secretos y solo Caddy con puertos publicados.
    - `/api/internal/*` y `/api/integrations/*` inaccesibles desde afuera.
    - Cabeceras.
    - **OWASP ZAP baseline** (gratuito) contra `tienda.localhost` y `sistema.localhost`.
    - gitleaks en los tres repos.
  - Cierra cuando: ZAP no tiene alertas _High_ y las _Medium_ están resueltas o justificadas.
- [ ] **F16·3 [infra] Se probó recuperar todo desde un backup**
  - Para qué: saber que funciona y cuánto tarda antes de necesitarlo.
  - Qué hacer: backup → borrar volúmenes → restaurar (F3·7). Medir el tiempo.
  - Cierra cuando: la restauración funciona y el tiempo queda en la bitácora.
- [ ] **F16·4 [infra] Sabemos cuántos recursos consume el ecosistema**
  - Para qué: elegir el tamaño y el costo del servidor.
  - Qué hacer: `docker stats` en reposo y con una carga simple (k6 o autocannon: 20 usuarios navegando y 2 compras por minuto durante 10 min).
  - Cierra cuando: hay RAM y CPU pico por servicio, con una recomendación de tamaño de EC2 y arquitectura (D11).
- [ ] **F16·5 [t3d] Está decidido si se despliega y por qué**
  - Para qué: cerrar la etapa local con una decisión informada.
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
- [ ] **F18·2** Correr `db/init/00-roles.sh` contra RDS con el usuario _master_; no requiere superusuario (§5.3).
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

| Riesgo                                                                                                  | Impacto                                                           | Mitigación                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Los precios de la web cambian al pasar a Venta Directa (redondeo hacia arriba a 50 y markups actuales). | La dueña ve precios distintos a los de hoy.                       | Reporte F9·3 antes de publicar; los ajustes se hacen en markups o categorías del sistema.                                 |
| El sistema tiene 1 solo color de filamento cargado.                                                     | No se puede publicar nada con colores.                            | F9·1 antes de F9·2.                                                                                                       |
| F-30 no tiene una solución conocida todavía.                                                            | Sin imagen de producción de la web no hay prueba integral ni EC2. | F2·1 es lo primero de F2; si se traba, construir la web del sistema con `next start` sobre el build completo como plan B. |
| El checkout depende de que tienda3d responda (D2).                                                      | Si el sistema se cae, no se vende.                                | Los dos corren en el mismo host; mensaje claro y monitoreo en F17·6.                                                      |
| Datos personales en dos bases (cuentas en el sitio y clientes en el sistema, D4).                       | Más superficie ante una filtración.                               | El sistema guarda solo nombre, email, teléfono y documento (nunca contraseñas); backups cifrados.                         |
| El panel de gestión pasa de estar solo en el taller a estar en internet.                                | Más exposición.                                                   | D8 (capa extra gratuita), bloqueo por intentos y cookies `Secure`.                                                        |
| Tamaño del trabajo (≈200–300 h en local).                                                               | Mucho tiempo sin nada utilizable.                                 | Fases con valor propio: al terminar F12, el catálogo ya sale del sistema; F13–F15 se pueden priorizar.                    |
| Una sola instancia (límites, sesiones y crons en memoria o en la base).                                 | No escala horizontalmente.                                        | Aceptado para este volumen; si hace falta, Redis para límites y _leader election_ para crons.                             |
| Next 16.0.0 en tienda3d y 16.4.x en el storefront.                                                      | Diferencias de comportamiento entre los dos.                      | Opcional: alinear versiones en F2.                                                                                        |

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

| Fecha      | Fase | Nota                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-26 | —    | Plan creado a partir del relevamiento de los dos sistemas y la base local en uso. Decisiones T1–T11 de Pablo; D1–D12 propuestas, a confirmar en F0·3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-27 | F0   | Decisiones definidas (§3): D4 cambia a clientes del sistema y D16 pide cuenta para las solicitudes; el resto, como se proponía. Sin GitHub Actions: verificación con hooks locales. Rama `unificacion` en [t3d] y [sf], rama por defecto mientras dure el trabajo. Títulos de tareas reescritos como resultados, con su "Para qué", para el tablero.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-27 | F0·4 | Línea de base en verde. [t3d]: typecheck y lint ok, 131/131 unitarios (12 suites), 24/24 de integración (5 suites, Postgres 16 temporal). [sf]: typecheck y lint ok, 61/61 unitarios, 18/18 e2e (escritorio + celular) contra la imagen de producción. Sigue abierto F-30 (imagen de producción de la web de [t3d]), que es F2·1.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-28 | F5   | Fase cerrada: publicaciones con miembros, opciones de color por línea de filamento, opciones informativas, variantes con SKU `-VNN`, categorías de la vidriera, publicar/ocultar con checklist y ajustes de venta, todo bajo `/web-catalog` con tests de integración. Decisiones de implementación: lo que tiene variantes no se borra sino que queda inactivo (miembro, opción de color, atributo, valor) y la pausa manual de una variante (`pausedByAdmin`) sobrevive a la regeneración.                                                                                                                                                                                                                                                                                     |
| 2026-10-28 | F6   | Fase cerrada: fotos en el volumen `media` con control de path traversal (texto y `realpath`), subida con conversión a WebP sin EXIF (`sharp`, probado en la imagen Alpine), galería ordenable, foto por color y por categoría, y lectura autenticada para el panel. Probado de punta a punta en el ecosistema por `sistema.localhost`; el sitio ve el volumen de solo lectura. `make dev` pasa `-V` para que una dependencia nueva llegue a los `node_modules` de desarrollo. El hook de formato reescribía `pnpm-lock.yaml`: queda en `.prettierignore`.                                                                                                                                                                                                                       |
| 2026-10-28 | F7   | Fase cerrada: precio web = Venta Directa a cliente normal, cantidad 1, del mismo cálculo que el panel de precios; motivos de `NO_PRICE` con cómo resolverlos; recálculo automático con `@AffectsPrices` en las 15 escrituras de §4.3 (debounce de 2 s, cron de 10 min y botón), historial con causa y alertas en el listado. Los criterios "el panel muestra" de F7·3 y F7·4 se cumplen con las pantallas de F8 (F8·4 y F8·3).                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-28 | F8   | Fase cerrada: panel "Tienda online" en tienda3d (listado de publicaciones con alertas, editor con cinco pestañas, sección en la ficha del producto con el interruptor "Visible en la tienda", categorías y ajustes). Recorridos automatizados con Playwright en el ecosistema, sin errores de consola, con capturas en `anexos/capturas/`. F8·4 se hizo antes que F8·2 (el criterio de F8·2 necesitaba el editor). Los criterios que dependían de otras fases pasaron a ellas: las 13 publicaciones migradas a F9 y el checkout a F12. Correcciones al pasar: `formatDateTime` de 24 h (es-AR mostraba 13:14 como 01:14), montos en formato argentino, detalle de validación en los toasts, y en [infra] el watch de la API de desarrollo ve los cambios de `@tienda3d/shared`. |
| 2026-10-28 | F10  | Fase cerrada: esquema `storefront_v1` con ocho vistas `security_barrier` que muestran solo lo publicado y vendible, permisos del lector reaplicados en cada migración (`grants-reader.sql` + `READER_DB_ROLE` en infra) y tests de contrato como el lector (lee las vistas, no ve `public`, no escribe, columnas fijadas en el test). Probado en el ecosistema con el `storefront_reader` real. Contrato documentado en `docs/contrato-storefront-v1.md`, con los vectores de la firma de F11.                                                                                                                                                                                                                                                                                  |
| 2026-10-28 | D12  | Respuestas de Pablo al pedido de F0·5: colores se amplían en el sistema (la tienda solo ofrece los del sistema), precios OK, productos nuevos los publica la dueña desde el sistema. La base de tienda3d de este equipo no es la del sistema en uso: F9·1 y F9·2 se corren en local con su OK, y la conciliación con datos reales (F9·3) se hace al final con un dump de Camila. F1·5 (rotar claves de la base) pasa al despliegue. Workflows del tablero activados.                                                                                                                                                                                                                                                                                                            |
| 2026-10-28 | F9   | Base local de tienda3d (`:5432`, 38 productos, OK de Pablo) copiada al ecosistema con `pg_dump`/`pg_restore` (dueño `tienda3d_owner`), reemplazando los datos de prueba; `tienda3d-migrate` aplicó las 10 migraciones pendientes, los permisos y la clave del sitio. Comparada tabla por tabla contra el origen: igual salvo los 4 permisos de la tienda online. El seed había renombrado un canal y agregado el producto de demo: se revirtió en la copia y se corrigió el seed (F9·1). Al panel del ecosistema se entra con el admin de esa base.                                                                                                                                                                                                                             |
