# Plan: Correcciones de la auditoría de código (2026-08-21)

> Plan vivo. Marcar tareas con `[x]` a medida que se avanza. Cada fase tiene su
> bloque **Tests / verificación** — no pasar a la siguiente hasta verde.
> Actualizar la **Bitácora** al cerrar cada fase.

Corrige los 25 hallazgos de la auditoría sobre el commit `3d0042e`
(`feature/keychain-catalog-product`). Ningún hallazgo requiere reescribir un
módulo: son parches acotados, más una fase de tests y una de consolidación de
contrato.

**Orden del plan = daño evitado / esfuerzo**, no severidad pura. Las fases 1 a 3
son de horas y bajan el riesgo estructural; de la 4 en adelante se puede
reordenar según prioridad de negocio.

---

## Convenciones de trabajo

| Ítem | Convención |
|---|---|
| Rama por fase | `fix/auditoria-fase-N-<slug>` desde `main` |
| Commits | Mismo estilo del repo: `fix(scope): …`, `chore(scope): …`, `test(scope): …` |
| Referencia al hallazgo | Incluir el id en el cuerpo del commit: `Cierra F-03.` |
| Verificación mínima antes de cerrar fase | `pnpm typecheck && pnpm test` en verde |

```bash
# Verificación estándar (desde la raíz)
pnpm typecheck
pnpm test
pnpm lint          # a partir de la Fase 3, hoy no corre (F-17)

# Dentro de Docker
docker compose exec api sh -c "cd apps/api && pnpm test"
```

---

## Tablero de estado

Marcar el estado en la última columna: `pendiente` / `en curso` / `hecho` / `descartado`.

| ID | Hallazgo | Sev | Fase | Estado |
|---|---|---|---|---|
| F-01 | El seed borra los permisos de clientes de admin/operator/viewer | Alta | 1 | **hecho** |
| F-03 | Healthcheck del contenedor `api` apunta a una ruta inexistente | Alta | 1 | **hecho** |
| F-04 | Cambiar estado de cotización sólo exige `quote:read` | Alta | 1 | **hecho** |
| F-02 | Consumo de stock de producción no atómico | Alta | 2 | **hecho** |
| F-10 | Códigos de cotización y OP generados con `max + 1` | Media | 2 | **hecho** |
| F-17 | El linter no corre en ningún workspace | Baja | 3 | **hecho** |
| F-18 | Builds de Docker sin lockfile congelado y con `\|\| true` | Baja | 3 | **hecho** |
| F-19 | El contenedor de la API corre como root | Baja | 3 | **hecho** |
| F-21 | Dependencias declaradas sin uso | Baja | 3 | **hecho** |
| F-22 | Artefactos compilados versionados (`seed.js`, `.d.ts`, `.map`) | Baja | 3 | **hecho** |
| F-06 | El preview de ítem descarta las advertencias del motor | Media | 4 | **hecho** |
| F-08 | Meses calculados en UTC con negocio en ART | Media | 4 | **hecho** |
| F-09 | Cierre mensual manual cierra el mes equivocado los días 29-31 | Media | 4 | **hecho** |
| F-05 | Rate limit de login evadible vía `x-forwarded-for` | Alta | 5 | **hecho** |
| F-12 | Los 500 devuelven el mensaje crudo de la excepción | Media | 5 | **hecho** |
| F-13 | CSV exportado sin neutralizar fórmulas | Media | 5 | **hecho** |
| F-23 | `.env` local con los secretos de ejemplo | Baja | 5 | **parcial (falta rotar clave de DB y admin)** |
| F-07 | `unitCost` persistido sin los ajustes del cliente | Media | 6 | **hecho** |
| F-11 | Nada garantiza un único precio vigente por insumo | Media | 6 | **hecho** |
| F-15 | IVA 21% hardcodeado en el motor de precios | Media | 6 | **hecho** |
| F-24 | `roundPriceUp` puede cobrar un paso de más | Baja | 6 | **hecho** |
| F-14 | Cada ítem recarga el cliente entero dos veces | Media | 7 | **hecho** |
| F-16 | Backup sin contrapresión ni cancelación | Media | 7 | **hecho** |
| F-25 | Tests cubren el cálculo, no el sistema | Baja | 8 | **parcial (falta suite con DB)** |
| F-20 | `packages/shared` no comparte el contrato real | Baja | 9 | **parcial (a, b)** |

**Progreso:** 22 / 25 completos + 3 parciales — ver Bitácora

---

## Decisiones que necesito confirmadas

No bloquean el arranque — cada una tiene un default asumido. Si el default no
sirve, avisar antes de la fase indicada.

1. **F-04 · Permiso para cambiar estado.** *Default asumido:* subir el endpoint a
   `quote:create` (mínimo cambio, sin migración). *Alternativa:* crear
   `quote:status` para separar "armar cotizaciones" de "cerrar ventas" — requiere
   migración y tocar el seed. → **Fase 1**
2. **F-02 · ¿El stock puede quedar negativo?** Hoy `consumeStock` descuenta sin
   verificar disponibilidad. *Default asumido:* se mantiene el comportamiento
   (permite negativo) y sólo se arregla la atomicidad. *Alternativa:* bloquear el
   pase a `DONE` si falta stock. → **Fase 2**
3. **F-08 · Zona horaria del negocio.** *Default asumido:*
   `America/Argentina/Buenos_Aires`, la misma que ya usa el cron. → **Fase 4**
4. **F-05 · ¿Va a haber un reverse proxy (nginx/ALB) delante?** *Default
   asumido:* no por ahora → se sanean las cabeceras y se agrega bloqueo por
   cuenta, que es la defensa que no depende de la IP. → **Fase 5**
5. **F-15 · Granularidad del IVA.** *Default asumido:* un `GlobalParam`
   `iva_pct` único (21). *Alternativa:* alícuota por canal. → **Fase 6**

---

## Fase 1 — Parches de una línea

**Objetivo:** cerrar los tres agujeros que se arreglan con una edición puntual y
sin riesgo de regresión. Estimado: ~1 h.

### F-01 · El seed deja de borrar permisos que no conoce

[`apps/api/prisma/seed.ts`](../../apps/api/prisma/seed.ts)

El problema es la combinación de dos cosas en `seedRoles()`: borra **todas** las
filas de `role_permissions` del rol (línea 90) y las recrea desde la constante
`PERMISSIONS` (línea 15), que no incluye los seis permisos que agregó la
migración `20260508010000_customers`. Correr `pnpm prisma:seed` sobre una base
existente deja a admin, operator y viewer sin `customer:*`.

> El rol `customer-portal` **no** se ve afectado: `seedRoles()` sólo toca
> admin/operator/viewer. Los permisos `portal:*` sobreviven.

- [x] **F-01.a** Agregar al catálogo `PERMISSIONS` los tres permisos de staff que
      faltan, respetando el reparto que hizo la migración:

      ```ts
      // Customers
      'customer:read',
      'customer:write',
      'customer:portal:manage',
      ```

      `VIEWER_PERMS` filtra por `endsWith(':read')`, así que `customer:read` cae
      solo en viewer — correcto. `customer:portal:manage` **no** debe ir a
      operator: agregarlo a la lista de exclusión de `OPERATOR_PERMS`.

- [x] **F-01.b** Sembrar los permisos del portal en el catálogo **sin**
      asignarlos a los roles de staff. Constante aparte:

      ```ts
      const PORTAL_PERMISSIONS = [
        'portal:catalog:read',
        'portal:order:create',
        'portal:profile:edit',
      ] as const;
      ```

      `seedPermissions()` los crea; `seedRoles()` los ignora. (Si `portal:catalog:read`
      entrara en `PERMISSIONS`, el filtro `:read` se lo daría a viewer.)

- [x] **F-01.c** Reemplazar el borrado destructivo por una reconciliación no
      destructiva. `deleteMany` + `createMany` también borra los ajustes que un
      admin haya hecho desde **Admin > Roles** sobre los roles base:

      ```ts
      await prisma.rolePermission.createMany({
        data: permissionKeys
          .map((k) => byKey.get(k))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
      ```

      Si en el futuro hace falta *revocar* un permiso desde el seed, hacerlo
      explícito con un `REVOKED` por rol, nunca con un borrado ciego.

**Tests / verificación**

```bash
# 1. Snapshot de permisos por rol ANTES
docker compose exec -T db psql -U tienda3d -d tienda3d -c \
  "SELECT r.name, count(*) FROM role_permissions rp
   JOIN roles r ON r.id = rp.\"roleId\" GROUP BY r.name ORDER BY r.name;"

# 2. Correr el seed
docker compose exec api sh -c "cd apps/api && pnpm prisma:seed"

# 3. Mismo query: los conteos NO deben bajar, y customer:* debe seguir
docker compose exec -T db psql -U tienda3d -d tienda3d -c \
  "SELECT r.name, p.key FROM role_permissions rp
   JOIN roles r ON r.id = rp.\"roleId\"
   JOIN permissions p ON p.id = rp.\"permissionId\"
   WHERE p.key LIKE 'customer%' OR p.key LIKE 'portal%' ORDER BY r.name, p.key;"
```

- [ ] Tras el seed, `admin` conserva `customer:read`, `customer:write`, `customer:portal:manage`
- [ ] `operator` conserva `customer:read` y `customer:write`, y **no** tiene `customer:portal:manage`
- [ ] `viewer` conserva `customer:read` y ningún `portal:*`
- [ ] `customer-portal` sigue con sus tres `portal:*`
- [ ] Con sesión de admin, `/clientes` carga y `GET /api/customers` responde 200

### F-03 · Healthcheck del contenedor `api`

[`docker-compose.yml:43`](../../docker-compose.yml#L43) ·
[`apps/api/src/main.ts:34`](../../apps/api/src/main.ts#L34)

- [x] **F-03.a** Corregir la URL del healthcheck a `/api/health` (el prefijo
      global es `api`, como documenta el README).
- [x] **F-03.b** Ahora que la señal es confiable, endurecer la dependencia:

      ```yaml
      web:
        depends_on:
          api:
            condition: service_healthy
      ```

**Tests / verificación**

```bash
docker compose up -d --force-recreate api
sleep 40 && docker compose ps          # api debe figurar (healthy)
docker inspect --format '{{json .State.Health}}' tienda3d_api | head -c 400
```

- [ ] `docker compose ps` muestra `api` como `healthy`, no `unhealthy`
- [ ] `web` arranca después de que `api` está sano

### F-04 · Permiso del cambio de estado de cotización

[`apps/api/src/modules/quotes/quotes.controller.ts:175`](../../apps/api/src/modules/quotes/quotes.controller.ts#L175)

`PATCH /quotes/:id/status` exige `quote:read`, que el rol `viewer` tiene. Y no es
sólo una etiqueta: pasar a `ACCEPTED` dispara `applyMonthlyVolumeDelta()`, que
imputa volúmenes mensuales y alimenta las suspensiones automáticas del cierre de
mes.

- [x] **F-04.a** Cambiar el decorador a `@Permissions('quote:create')`
      (ver decisión abierta #1 si se prefiere un `quote:status` propio).
- [x] **F-04.b** Verificar que el frontend no ofrezca los botones de estado a
      quien no tenga el permiso: revisar
      [`quote-actions.tsx`](../../apps/web/src/app/%28protected%29/cotizaciones/%5Bid%5D/quote-actions.tsx)
      y ocultar/deshabilitar según `quote:create`.
- [x] **F-04.c** Agregar el audit log que falta en `DELETE /quotes/:id`
      ([`quotes.service.ts` `remove()`](../../apps/api/src/modules/quotes/quotes.service.ts)),
      hoy la única mutación de cotización que no deja rastro.

**Tests / verificación**

- [ ] Con un usuario de rol `viewer`, `PATCH /api/quotes/:id/status` devuelve 403
- [ ] Con `operator` sigue devolviendo 200
- [ ] En la UI, un `viewer` no ve los botones de cambio de estado
- [ ] Borrar una cotización en borrador genera una fila en `audit_logs`

**Criterio de salida de la Fase 1:** los tres checks de verificación pasan,
`pnpm typecheck && pnpm test` en verde.

---

## Fase 2 — Integridad de datos

**Objetivo:** que ninguna operación pueda dejar la base a medio escribir.
Estimado: ~3 h.

### F-02 · Consumo de stock atómico

[`apps/api/src/modules/productions/productions.service.ts:156-166`](../../apps/api/src/modules/productions/productions.service.ts#L156-L166)

Hoy `consumeStock()` abre su propia transacción y el `update({ status: DONE })`
queda afuera. Dos fallas reales:

- Si el update falla o el proceso muere en el medio, el stock ya se descontó pero
  la orden sigue en `IN_PROGRESS`; al reintentar se descuenta **dos veces**.
- La validación de transición lee el estado antes de escribir, así que dos
  requests concurrentes a `DONE` pasan ambos y descuentan el doble.

- [x] **F-02.a** Unificar todo en una transacción y cerrar la carrera con un
      update condicional sobre el estado leído:

      ```ts
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.productionOrder.updateMany({
          where: { id, status: order.status },   // sólo si nadie lo movió
          data: {
            status,
            ...(status === ProductionStatus.IN_PROGRESS && !order.startedAt && { startedAt: new Date() }),
            ...(status === ProductionStatus.DONE && { finishedAt: new Date() }),
          },
        });
        if (claimed.count === 0) {
          throw new ConflictException('La orden cambió de estado, recargá la página');
        }
        if (status === ProductionStatus.DONE) {
          await this.consumeStock(tx, order, actorId);
        }
      });
      ```

- [x] **F-02.b** Refactorizar `consumeStock()` para que reciba el
      `Prisma.TransactionClient` en vez de abrir el suyo. `previewConsumption()`
      hace lecturas: calcular las líneas **antes** de abrir la transacción y
      pasarlas ya resueltas, para no alargar la transacción con I/O de lectura.

- [x] **F-02.c** Aplicar el mismo patrón de update condicional a
      [`quotes.service.ts` `setStatus()`](../../apps/api/src/modules/quotes/quotes.service.ts):
      tiene la misma forma (lee estado → valida transición → escribe) y su efecto
      lateral, `applyMonthlyVolumeDelta`, también es acumulativo.

- [x] **F-02.d** *(según decisión abierta #2)* Si se decide bloquear stock
      negativo: validar disponibilidad dentro de la misma transacción antes de
      descontar, con un mensaje que nombre el insumo faltante.

**Tests / verificación**

```bash
# Doble DONE concurrente sobre la misma orden: uno debe fallar con 409
ORDER=<id>; TOKEN=<cookie>
for i in 1 2; do
  curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
    "http://localhost:3000/api/productions/$ORDER/status" \
    -H 'content-type: application/json' -b "$TOKEN" \
    -d '{"status":"DONE"}' &
done; wait
```

- [ ] De dos requests concurrentes a `DONE`, uno responde 200 y el otro 409
- [ ] `stock_movements` tiene exactamente una fila `OUT` por insumo para esa orden
- [ ] El `currentStock` bajó una sola vez (comparar snapshot antes/después)
- [ ] Forzando un error después del descuento, la transacción revierte: ni la
      orden queda en `DONE` ni el stock queda descontado

### F-10 · Códigos secuenciales sin carrera

[`quotes.service.ts:912`](../../apps/api/src/modules/quotes/quotes.service.ts#L912) ·
[`productions.service.ts:282`](../../apps/api/src/modules/productions/productions.service.ts#L282)

Ambos `nextCode()` leen el último código, suman 1 y crean la fila fuera de esa
lectura. Dos creaciones simultáneas calculan el mismo número y la segunda choca
contra el índice único de `code` con un 409 sin explicación. El repo ya resolvió
bien este problema para el SKU de producto (`nextval('product_sku_seq')`).

- [x] **F-10.a** Migración que crea las secuencias, una por tipo de documento:

      ```sql
      CREATE SEQUENCE IF NOT EXISTS quote_code_seq_product;
      CREATE SEQUENCE IF NOT EXISTS quote_code_seq_adhoc;
      CREATE SEQUENCE IF NOT EXISTS production_code_seq;
      ```

      Inicializarlas con `setval` al máximo actual de cada prefijo para no
      recomenzar en 1 sobre datos existentes.

- [x] **F-10.b** Reemplazar los dos `nextCode()` por `nextval`, siguiendo el
      patrón de `generateNextSku()` en
      [`products.service.ts:416`](../../apps/api/src/modules/products/products.service.ts#L416).

- [x] **F-10.c** **Decidir el reinicio anual.** Hoy el prefijo incluye el año
      (`Q-2026-0001`) y el contador se deriva del máximo del año en curso. Una
      secuencia global no reinicia sola: o se acepta numeración continua entre
      años, o se agrega un `setval` en el primer código de cada año. Documentar
      la decisión acá.

**Tests / verificación**

- [ ] Crear 20 cotizaciones en paralelo: 20 códigos únicos, ningún 409
- [ ] Los códigos siguen respetando `Q-YYYY-NNNN` / `R-YYYY-NNNN` / `OP-YYYY-NNNN`
- [ ] Sobre la base con datos, el primer código nuevo continúa el máximo previo y
      no pisa uno existente

**Criterio de salida de la Fase 2:** ninguna secuencia de operaciones concurrente
deja stock ni códigos inconsistentes.

---

## Fase 3 — Tooling que evita reincidencia

**Objetivo:** que la próxima tanda de bugs se detecte antes de llegar a la base.
Estimado: ~3 h.

### F-17 · Poner a andar el linter

No existe ningún `eslint.config.js` ni `.eslintrc` en el repo. ESLint 9 —la
versión instalada— exige el formato plano y aborta. Del lado de web es peor:
`"lint": "next lint"`, y `next lint` fue **eliminado en Next 16**. O sea que
`pnpm lint` desde la raíz no valida nada, con ESLint, typescript-eslint y
eslint-config-next instalados en las tres workspaces.

- [x] **F-17.a** `apps/api/eslint.config.js` plano, con typescript-eslint en modo
      *type-checked*. Las reglas que más rinden acá:

      ```js
      '@typescript-eslint/no-floating-promises': 'error',   // audit.record() sin await
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      ```

- [x] **F-17.b** `apps/web/eslint.config.js` con `eslint-config-next` en formato
      plano (`FlatCompat` o el export plano de la 16), e incluir
      `react-hooks/exhaustive-deps`.
- [x] **F-17.c** Cambiar el script de web: `"lint": "eslint ."` (dejar
      `next lint` es dejar un comando que ya no existe).
- [x] **F-17.d** Arreglar lo que aparezca, o silenciar con justificación escrita.
      **No** bajar reglas a `warn` para que el comando pase en verde.
- [x] **F-17.e** Agregar `eslint.config.js` a `packages/shared` o excluirla
      explícitamente del `-r lint`.

**Tests / verificación**

```bash
pnpm lint          # debe correr y terminar en 0 en los tres workspaces
```

- [ ] `pnpm lint` corre sin el error `couldn't find an eslint.config file`
- [ ] Termina con exit code 0
- [ ] Anotar en la Bitácora cuántos hallazgos reportó la primera corrida — es la
      medida de lo que estuvo invisible todo este tiempo

### F-18 · Builds de Docker reproducibles

[`apps/api/Dockerfile:12`](../../apps/api/Dockerfile#L12) ·
[`apps/web/Dockerfile:12`](../../apps/web/Dockerfile#L12)

- [x] **F-18.a** `--frozen-lockfile=false` → `--frozen-lockfile` en ambos.
- [x] **F-18.b** Sacar el `|| true` de
      `RUN pnpm --filter @tienda3d/shared build || true`
      ([Dockerfile:22](../../apps/api/Dockerfile#L22)): convierte un fallo de
      compilación en un éxito silencioso.
- [x] **F-18.c** Si `--frozen-lockfile` falla, es señal de que el lockfile quedó
      desactualizado: correr `pnpm install` en local y commitear el lockfile, no
      volver a aflojar el flag.

**Tests / verificación**

```bash
docker compose build --no-cache api web
```

- [ ] Ambas imágenes buildean con el lockfile congelado
- [ ] La app levanta y `/api/health` responde `{"status":"ok"}`

### F-19 · La API deja de correr como root

[`apps/api/Dockerfile`](../../apps/api/Dockerfile)

La imagen de web ya lo hace bien (crea `nextjs` y hace `USER nextjs`). La de la
API nunca cambia de usuario, y es la que tiene el cliente de Postgres instalado y
ejecuta `pg_dump` como subproceso.

- [x] **F-19.a** Crear usuario y grupo del sistema en el stage `runner` y agregar
      `USER` antes del `CMD`, replicando el patrón de la imagen de web.
- [x] **F-19.b** Verificar que `prisma migrate deploy` y `pg_dump` siguen
      funcionando sin root (permisos de lectura sobre `prisma/` y de escritura
      sobre nada — el dump va a stdout).
- [x] **F-19.c** Evaluar dejar de publicar el puerto 3001 al host en
      `docker-compose.yml`: el README dice que el navegador nunca pega directo a
      la API. Si nadie lo usa para debug, sacarlo reduce superficie.

**Tests / verificación**

```bash
docker compose exec api whoami          # NO debe decir root
docker compose exec api sh -c "cd apps/api && pnpm prisma migrate deploy"
```

- [ ] `whoami` devuelve el usuario nuevo
- [ ] Las migraciones corren
- [ ] El backup desde **Parámetros > Base de datos** descarga un `.dump` válido
      (`pg_restore --list` lo lee)

### F-21 · Dependencias sin uso

- [x] **F-21.a** Sacar de `apps/web/package.json`: `@tanstack/react-query`,
      `@radix-ui/react-toast` (se usa `sonner`), `@radix-ui/react-dialog` y
      `@radix-ui/react-dropdown-menu` (los diálogos son propios).
- [x] **F-21.b** Sacar de `apps/api/package.json`: `class-validator` y
      `class-transformer` (la validación es toda Zod).
- [x] **F-21.c** Revisar `react-hook-form` + `@hookform/resolvers`: sólo los usa
      el login; los demás formularios son `useState` a mano. Decidir explícito —
      adoptarla en los formularios grandes o sacarla y migrar el login.

**Tests / verificación**

- [ ] `pnpm install` regenera el lockfile sin esos paquetes
- [ ] `pnpm typecheck` y `pnpm build` de web siguen en verde

### F-22 · Artefactos compilados fuera del repo

- [x] **F-22.a** `git rm --cached apps/api/prisma/seed.js apps/api/prisma/seed.d.ts apps/api/prisma/seed.js.map apps/api/prisma/seed.d.ts.map`
- [x] **F-22.b** Agregar `apps/api/prisma/seed.js*` y `apps/api/prisma/seed.d.ts*`
      al `.gitignore` (el seed se ejecuta con `tsx prisma/seed.ts`, esos archivos
      no los consume nadie).

**Tests / verificación**

- [ ] `git status` limpio tras el borrado
- [ ] `pnpm prisma:seed` sigue funcionando

**Criterio de salida de la Fase 3:** `pnpm lint` corre en verde en CI local y las
imágenes buildean con lockfile congelado.

---

## Fase 4 — Fechas y feedback al usuario

**Objetivo:** que los números y las alertas que ve una persona sean correctos.
Estimado: ~4 h.

### F-06 · Devolver las advertencias al preview

[`quotes.service.ts:400`](../../apps/api/src/modules/quotes/quotes.service.ts#L400)

`previewItem()` devuelve `warnings: []` literal. El calculador y el motor
producen advertencias que importan — «Filamento X no tiene precio vigente», «MELI
requiere cargar la comisión por producto», «comisión + impuestos ≥ 100%» — y
ninguna llega a la pantalla donde el vendedor arma la cotización. Un filamento
sin precio vigente se costea en 0 y el precio sale bajo, sin ninguna señal.

- [x] **F-06.a** Hacer que `buildItemRow()` devuelva el `breakdown` junto con la
      fila (ya lo construye para persistirlo; hoy se descarta en el camino del
      preview).
- [x] **F-06.b** En `previewItem()`, componer
      `[...cost.warnings, ...(line?.warnings ?? [])]` y devolverlo.
- [x] **F-06.c** Propagar también en `keychainMatrix()`: si una escala sale con
      advertencia, la fila de la matriz debe poder mostrarlo.
- [x] **F-06.d** Pintarlas en el frontend, en los tres formularios de cotización
      ([`rapid-quote-form.tsx`](../../apps/web/src/app/%28protected%29/cotizaciones/nueva-a-medida/rapid-quote-form.tsx),
      [`product-quote-form.tsx`](../../apps/web/src/app/%28protected%29/cotizaciones/nueva-catalogo/product-quote-form.tsx)
      y el de llaveros). Advertencia visible junto al precio, no un toast que se
      va: es información sobre el número que están por firmar.

**Tests / verificación**

- [ ] Cotizar un ítem con un filamento **sin** precio vigente → el preview muestra
      la advertencia y el precio sigue calculándose
- [ ] Cotizar en canal MELI un producto sin comisión cargada → advertencia visible
- [ ] Un ítem sano no muestra ninguna advertencia (sin falsos positivos)

### F-08 · Inicio de mes en la zona del negocio

[`quotes.service.ts:302`](../../apps/api/src/modules/quotes/quotes.service.ts#L302) ·
[`customer-cron.service.ts`](../../apps/api/src/modules/customers/customer-cron.service.ts)

`startOfMonthUtc()` parte el mes en UTC, pero el cron corre en
`America/Argentina/Buenos_Aires` y las ventas ocurren en ART (UTC−3). Una
cotización aceptada entre las 21:00 y las 23:59 del último día del mes cae en el
día 1 en UTC y se imputa al **mes siguiente**. Como esos volúmenes alimentan el
cumplimiento de compromiso mayorista, un cliente puede terminar suspendido
automáticamente por ventas que sí hizo.

- [x] **F-08.a** Crear un helper único en
      [`common/utils/date.ts`](../../apps/api/src/common/utils/date.ts) —
      `startOfBusinessMonth(date)` — que calcule el inicio de mes en la zona del
      negocio, con la TZ en una constante exportada y compartida con el `@Cron`.
- [x] **F-08.b** Reemplazar las **dos** copias locales de `startOfMonthUtc` (una
      en `quotes.service.ts`, otra en `customer-cron.service.ts`) por el helper.
- [x] **F-08.c** Tests en
      [`date.spec.ts`](../../apps/api/src/common/utils/date.spec.ts) con los
      bordes: 30/09 23:30 ART y 01/10 00:30 ART deben caer en meses distintos y
      correctos.
- [x] **F-08.d** **Datos existentes:** revisar si hay filas de
      `customer_monthly_volumes` mal imputadas por este bug. Si las hay, decidir
      si se corrigen con una migración de datos o se dejan documentadas.

**Tests / verificación**

- [ ] Los tests de borde de `date.spec.ts` pasan
- [ ] Aceptar una cotización el último día del mes a las 22:00 ART la imputa a ese mes
- [ ] El cron y la imputación usan la misma constante de TZ (no dos literales)

### F-09 · Cierre mensual manual

[`customer-cron.service.ts:204`](../../apps/api/src/modules/customers/customer-cron.service.ts#L204) ·
[`customers.controller.ts:150`](../../apps/api/src/modules/customers/customers.controller.ts#L150)

`addMonths()` usa `setUTCMonth()`, que desborda cuando el día no existe en el mes
destino. Verificado ejecutándolo:

```
asOf=2026-03-31  →  cierra 2026-03-01   ✗ (debería ser febrero)
asOf=2026-05-31  →  cierra 2026-05-01   ✗
asOf=2026-07-31  →  cierra 2026-07-01   ✗
asOf=2026-03-15  →  cierra 2026-02-01   ✓
```

El cron programado corre el día 1, así que está a salvo. El endpoint manual
—el que el propio comentario recomienda usar «si el cron falla»— no: cerraría el
mes en curso, suspendiendo clientes por un mes que todavía no terminó.

- [x] **F-09.a** Restar meses sobre el día 1, nunca sobre el día original:
      `new Date(Date.UTC(y, m - 1, 1))`. Idealmente absorberlo dentro del helper
      de F-08.a para que quede un solo lugar donde se calculan meses.
- [x] **F-09.b** Cambiar el `throw new Error('asOf debe ser…')` por
      `BadRequestException` — hoy el filtro global lo normaliza a 500 en vez de 400.
- [x] **F-09.c** Test de `runMonthlyClose` con los cuatro `asOf` de la tabla.

**Tests / verificación**

- [ ] Los cuatro casos de la tabla devuelven el mes correcto
- [ ] `?asOf=no-es-fecha` responde 400 con el mensaje, no 500
- [ ] Correr el cierre dos veces sobre el mismo mes sigue siendo idempotente
      (no duplica suspensiones ni filas de volumen)

**Criterio de salida de la Fase 4:** ninguna decisión automática sobre clientes
depende de una fecha mal calculada.

---

## Fase 5 — Seguridad

**Objetivo:** cerrar la superficie más expuesta. Estimado: ~4 h.

### F-05 · Rate limit de login

[`apps/web/src/app/api/[...path]/route.ts:4`](../../apps/web/src/app/api/%5B...path%5D/route.ts#L4) ·
[`apps/api/src/main.ts:22`](../../apps/api/src/main.ts#L22)

El proxy de Next reenvía todas las cabeceras del cliente salvo las hop-by-hop, y
la API corre con `app.set('trust proxy', 1)`. Como `fetch` de Node no agrega su
propio `x-forwarded-for`, el valor que llega a Express es el que mandó el
navegador tal cual: `req.ip` es lo que el atacante quiera. Rotando esa cabecera,
el límite de 10 intentos/minuto de `/auth/login` se vuelve inaplicable.

El mismo mecanismo hace que hoy, por el camino legítimo, **todos** los usuarios
compartan un único cupo (la IP del contenedor `web`) — probablemente por qué los
límites globales terminaron tan generosos.

- [x] **F-05.a** En el route handler del proxy, agregar al set de cabeceras
      filtradas todas las de reenvío entrantes: `x-forwarded-for`,
      `x-forwarded-host`, `x-forwarded-proto`, `x-forwarded-port`, `x-real-ip`,
      `forwarded`. Esto solo ya cierra la falsificación.
- [x] **F-05.b** Agregar **bloqueo por cuenta** en el login, que es la defensa
      real contra fuerza bruta porque no depende de la IP: contador de intentos
      fallidos consecutivos por usuario + backoff. Campos nuevos en `User`
      (`failedLoginAttempts`, `lockedUntil`), reseteados en un login exitoso.
      Mismo mensaje genérico en la respuesta para no filtrar si el mail existe.
- [x] **F-05.c** *(según decisión abierta #4)* Si más adelante se pone nginx o un
      ALB adelante: que el proxy setee `x-forwarded-for` con la IP real y recién
      ahí `trust proxy` vuelve a tener sentido. Documentarlo junto a la sección
      de migración a AWS del README.
- [x] **F-05.d** Con el bloqueo por cuenta puesto, revisar si los límites globales
      del throttler (`default: 120/min`, `auth: 120/min`) pueden volver a valores
      razonables.

**Tests / verificación**

```bash
# Debe cortar aunque rote la cabecera
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3000/api/auth/login \
    -H "content-type: application/json" -H "x-forwarded-for: 10.0.0.$i" \
    -d '{"email":"admin@plastik.local","password":"malaclave"}'
done; echo
```

- [ ] Rotando `x-forwarded-for`, los intentos se siguen bloqueando (429 o cuenta bloqueada)
- [ ] Tras N fallidos, la cuenta queda bloqueada aunque cambie la IP
- [ ] Un login correcto resetea el contador
- [ ] El bloqueo no permite enumerar mails: mismo mensaje y tiempo de respuesta

### F-12 · No filtrar mensajes internos en los 500

[`http-exception.filter.ts:95`](../../apps/api/src/common/filters/http-exception.filter.ts#L95)

Para cualquier `Error` no tipado, el filtro responde `message: exception.message`
al cliente. Los mensajes de Prisma, del filesystem o de red suelen incluir
nombres de tabla y columna, fragmentos de query, rutas del contenedor o cadenas
de conexión.

- [x] **F-12.a** En producción, responder un mensaje genérico
      (`'Error interno'`) y dejar el detalle sólo en el log de pino, que ya lo
      registra con stack completo dos líneas más arriba.
- [x] **F-12.b** En desarrollo, mantener el mensaje real (ayuda a depurar).
      Usar `NODE_ENV`, igual que hace `AuthController.isProd`.
- [x] **F-12.c** Revisar la rama `default` de `fromPrismaKnown`: hoy devuelve
      `exception.message.split('\n').pop()`, que también puede filtrar SQL.

**Tests / verificación**

- [ ] Con `NODE_ENV=production`, un error forzado devuelve `{ code: 'INTERNAL', message: 'Error interno' }`
- [ ] El log del contenedor sí contiene el mensaje y el stack completos
- [ ] En desarrollo el mensaje real sigue llegando al cliente

### F-13 · CSV sin inyección de fórmulas

[`csv.service.ts:97`](../../apps/api/src/modules/reports/csv.service.ts#L97)

El escape es correcto para comillas y saltos de línea, pero no para celdas que
empiezan con `=`, `+`, `-` o `@`. Un cliente cargado como `=HYPERLINK(...)` se
ejecuta al abrir el archivo. Y el destino de estos exports es exactamente Excel:
el proyecto entero nació de una planilla.

- [x] **F-13.a** Dentro de `escape()`, prefijar con comilla simple cualquier valor
      que arranque con esos cuatro caracteres, antes del escapado de comillas.
- [x] **F-13.b** Aplicar el mismo tratamiento en cualquier otro generador de CSV
      que se agregue (dejarlo anotado en el helper).
- [x] **F-13.c** Test unitario de `toCsv` con los cuatro prefijos peligrosos.

**Tests / verificación**

- [ ] Un cliente llamado `=1+1` se exporta como `'=1+1` y Excel lo muestra como texto
- [ ] Los valores normales no cambian (sin comillas de más)
- [ ] Los CSV siguen abriendo bien en Excel y LibreOffice

### F-23 · Rotar los secretos de ejemplo

El `.env` local está correctamente fuera de git, pero conserva cinco valores del
ejemplo: `replace-with-…` en los dos secretos JWT, `changeme` en Postgres y
`admin123` en el admin. Los secretos de firma son entonces cadenas públicas de
este repo. Con `NODE_ENV=development` las cookies de sesión además viajan sin
`secure`.

- [x] **F-23.a** Generar y reemplazar: `API_JWT_SECRET`, `API_REFRESH_SECRET`,
      `POSTGRES_PASSWORD` (`openssl rand -base64 32`).
- [x] **F-23.b** Cambiar la contraseña del admin desde la UI y actualizar
      `SEED_ADMIN_PASSWORD`.
- [x] **F-23.c** Sacar la contraseña del `console.log` del seed
      ([`seed.ts:126`](../../apps/api/prisma/seed.ts#L126)) — en producción va
      derecho a los logs del contenedor. Imprimir sólo el mail.
- [x] **F-23.d** Validación al arranque: rechazar bootear con `NODE_ENV=production`
      si los secretos son cortos (< 32 chars) o iguales a los del `.env.example`.
      Hoy `getOrThrow` sólo verifica que existan.
- [x] **F-23.e** Al rotar `API_JWT_SECRET`, todas las sesiones activas se
      invalidan: avisar antes de hacerlo en horario de taller.

**Tests / verificación**

- [ ] `grep -cE "replace-with|changeme|admin123" .env` devuelve 0
- [ ] La app levanta y el login funciona con las credenciales nuevas
- [ ] Con un secreto del ejemplo y `NODE_ENV=production`, el arranque falla con un
      mensaje claro

**Criterio de salida de la Fase 5:** ningún secreto del repo sirve para firmar un
token válido, y la fuerza bruta sobre el login está acotada sin depender de la IP.

---

## Fase 6 — Consistencia de precios y costos

**Objetivo:** que los números guardados sean coherentes entre sí. Estimado: ~4 h.
Fase sensible: **cada tarea acá necesita su test**, el motor ya está validado
contra el Excel y no se puede romper esa validación.

### F-07 · `unitCost` con los mismos ajustes que el precio

[`quotes.service.ts:580`](../../apps/api/src/modules/quotes/quotes.service.ts#L580) ·
[`:767`](../../apps/api/src/modules/quotes/quotes.service.ts#L767)

Cuando el cliente tiene `skipMarketing` o `skipReinvestment`, el precio se calcula
sobre `adjustedCost.fabricationPrice`, pero la fila persiste
`unitCost: cost.totalCost` — el costo **sin** ajustar. Los dos números quedan
sobre bases distintas, así que cualquier margen derivado de la cotización guardada
(`unitPrice − unitCost`) sale inflado para esos clientes. El dato correcto sí queda
en `pricingBreakdown.context.fabricationPriceUsed`: es una inconsistencia de la
columna, no una pérdida de información.

- [x] **F-07.a** Persistir
      `adjustedCost.fabricationPrice + adjustedCost.otherMaterialsWithReplenishment`,
      que es exactamente el `totalCost` que ya se le pasa a `computeUnitPrice`.
      Aplica en los **dos** puntos (rama PRODUCT y rama ADHOC).
- [x] **F-07.b** Verificar el impacto en el dashboard y en los reportes: si algún
      cálculo de margen asumía el costo sin ajustar, se corrige solo, pero hay que
      confirmarlo.
- [x] **F-07.c** **Datos existentes:** las cotizaciones ya emitidas con clientes
      que tienen esos flags conservan el `unitCost` viejo. Decidir: dejarlas como
      snapshot histórico (recomendado, es lo que se firmó) o recalcular. Documentar.

**Tests / verificación**

- [ ] Cotizar el mismo producto para un cliente **con** y **sin** `skipMarketing`:
      en ambos casos `unitPrice − unitCost` coincide con el `profit` del breakdown
- [ ] Un cliente sin flags produce exactamente los mismos números que antes
- [ ] Los tests del motor siguen en verde

### F-11 · Un solo precio vigente por insumo

El costeo lee el precio con `suppliers: { where: { isCurrent: true }, take: 1 }`,
**sin `orderBy`**. La unicidad depende de que todas las escrituras pasen por
`MaterialPricesService`; no hay restricción en la base. Si dos filas quedan
vigentes —por un import, un restore parcial o un bug futuro— el costo de ese
insumo pasa a depender del plan de query: puede cambiar entre dos ejecuciones
idénticas.

- [x] **F-11.a** Migración con índice único parcial:

      ```sql
      CREATE UNIQUE INDEX "supplier_materials_one_current_per_material"
        ON "supplier_materials" ("materialId") WHERE "isCurrent";
      ```

- [x] **F-11.b** Antes de aplicarlo, detectar y resolver duplicados existentes:

      ```sql
      SELECT "materialId", count(*) FROM supplier_materials
      WHERE "isCurrent" GROUP BY "materialId" HAVING count(*) > 1;
      ```

- [x] **F-11.c** Agregar `orderBy: { registeredAt: 'desc' }` en las lecturas de
      `costing.service.ts` (dos lugares en `forProduct`, dos en `forAdhoc`) para
      que sea determinista incluso si el índice se cae.
- [x] **F-11.d** Verificar que `setCurrent()` y `create({ setCurrent: true })`
      siguen funcionando con el índice puesto: hacen `updateMany` de apagado y
      luego el encendido, ambos dentro de una transacción — el orden importa.

**Tests / verificación**

- [ ] La query de duplicados devuelve 0 filas antes de aplicar el índice
- [ ] Marcar un precio como vigente sigue apagando el anterior, sin violar el índice
- [ ] Intentar forzar dos vigentes por SQL directo falla

### F-15 · IVA configurable

[`pricing.engine.ts:199`](../../apps/api/src/modules/pricing/pricing.engine.ts#L199) ·
[`:211`](../../apps/api/src/modules/pricing/pricing.engine.ts#L211)

`finalMultiplier` usa el literal `1.21` en dos ramas. Todo el resto de las tasas
—régimen unificado, comisión de venta directa, IIBB, retenciones, paso de
redondeo— es configurable. El IVA, que es justamente el que cambia por decisión
ajena al taller, es el único que exige un deploy.

- [x] **F-15.a** Migración que agrega el `GlobalParam` `iva_pct` con valor `21`.
- [x] **F-15.b** Leerlo en `loadGlobals()` y sumarlo a `PricingGlobals`.
- [x] **F-15.c** Reemplazar los dos literales por `1 + globals.ivaPct / 100`.
- [x] **F-15.d** Exponerlo en `/parametros` junto a los demás.
- [x] **F-15.e** Actualizar `pricing.engine.spec.ts`: los tests ya inyectan
      globals, agregar `ivaPct: 21` para que la validación contra el Excel siga
      dando exactamente los mismos números.

**Tests / verificación**

- [ ] Con `iva_pct = 21`, todos los tests existentes dan idéntico
- [ ] Cambiar el parámetro a 10.5 mueve el precio final en la proporción esperada
- [ ] Los canales sin `appliesIva` no se ven afectados

### F-24 · `roundPriceUp` con epsilon

[`round-price.ts`](../../apps/api/src/modules/pricing/round-price.ts)

`Math.ceil(value / step) * step` redondea hacia arriba un valor que **ya era**
múltiplo del paso cuando la división cae apenas por encima del entero.
Verificado:

```
roundPriceUp(3000.0000000000005, 100)  →  3100
roundPriceUp(1210.0000000000002,  10)  →  1220
```

No son valores artificiales: son el tipo de resultado que sale de
`netPrice × 1.21` con `netPrice` proveniente de una división. Es raro, y el error
es a favor del taller, pero es un precio incorrecto sobre un módulo que el resto
del código trata con mucho cuidado.

- [x] **F-24.a** Aplicar un epsilon relativo antes del `ceil`, de forma que un
      valor a menos de ~1e-9 relativo por encima de un múltiplo no salte de paso.
- [x] **F-24.b** Agregar los dos casos verificados a
      [`round-price.spec.ts`](../../apps/api/src/modules/pricing/round-price.spec.ts).
- [x] **F-24.c** Confirmar que la idempotencia se mantiene:
      `roundPriceUp(roundPriceUp(x, s), s) === roundPriceUp(x, s)`.

**Tests / verificación**

- [ ] `roundPriceUp(3000.0000000000005, 100) === 3000`
- [ ] `roundPriceUp(3000.01, 100) === 3100` (un excedente real sí sube)
- [ ] Los tests existentes de redondeo siguen en verde

**Criterio de salida de la Fase 6:** el motor sigue reproduciendo el Excel y los
costos guardados son coherentes con los precios guardados.

---

## Fase 7 — Rendimiento y robustez

**Objetivo:** sacar trabajo lineal gratuito y dos fallas de recursos. Estimado: ~3 h.

### F-14 · Dejar de recargar el cliente por ítem

[`quotes.service.ts:215-223`](../../apps/api/src/modules/quotes/quotes.service.ts#L215-L223) ·
[`customers.service.ts:192`](../../apps/api/src/modules/customers/customers.service.ts#L192) ·
[`:241`](../../apps/api/src/modules/customers/customers.service.ts#L241)

`resolveCustomerContext()` llama `canBuy()` en un loop por ítem, y `canBuy()` hace
`getWithRelations()` — el cliente completo con commitments y overrides. Después
`buildItemRow()` vuelve a llamar `resolveProductProfile()`, que hace **otro**
`getWithRelations()`. Una cotización de 10 ítems dispara 20 cargas completas del
mismo cliente, más el resto de queries por ítem.

- [x] **F-14.a** Sobrecargar `canBuy` y `resolveProductProfile` para aceptar el
      `CustomerWithRelations` ya cargado, y pasarlo desde `resolveCustomerContext`
      / `buildItemRow` (que ya lo tienen en `customerCtx`).
- [x] **F-14.b** Resolver los productos de los ítems en **una** query
      (`findMany({ where: { id: { in: ids } } })`) en vez de una por ítem.
- [x] **F-14.c** Cargar los parámetros globales y las escalas de llavero **una vez**
      por creación de cotización, no una vez por ítem: hoy `computeUnitPrice` hace
      `loadGlobals()` en cada iteración.

**Tests / verificación**

```bash
# Contar queries: levantar la API con log de queries de Prisma
docker compose logs -f api | grep -c "prisma:query"
```

- [ ] Crear una cotización de 10 ítems dispara un número de queries que no crece
      linealmente con el cliente (medir antes/después y anotar en la Bitácora)
- [ ] Los precios resultantes son **idénticos** a los de antes del refactor
- [ ] Las validaciones de catálogo restringido siguen funcionando (cliente SPECIAL
      sin acceso → 403)

### F-16 · Backup con contrapresión y cancelación

[`database-backup.controller.ts:67`](../../apps/api/src/modules/database-backup/database-backup.controller.ts#L67)

El stdout de `pg_dump` se vuelca con `res.write(chunk)` ignorando el valor de
retorno. Si el cliente descarga más lento de lo que Postgres dumpea —habitual
sobre el Wi-Fi del taller— el buffer de la respuesta crece en memoria sin techo. Y
si el navegador cancela, el `pg_dump` queda huérfano ocupando una conexión.

- [x] **F-16.a** Reemplazar el `on('data')` manual por `proc.stdout.pipe(res)`,
      que resuelve la contrapresión sola.
- [x] **F-16.b** `res.on('close', () => proc.kill())` para cortar el dump si el
      cliente se va.
- [x] **F-16.c** Timeout máximo de dump, para que un `pg_dump` colgado no quede
      corriendo indefinidamente.
- [x] **F-16.d** Conservar el audit log actual (registra quién pidió el backup y
      con qué código de salida) también en el camino de cancelación.

**Tests / verificación**

- [ ] Un backup completo descarga bien y `pg_restore --list` lee el archivo
- [ ] Cancelar la descarga a mitad mata el proceso:
      `docker compose exec api ps aux | grep pg_dump` no deja huérfanos
- [ ] El audit log registra tanto el éxito como la cancelación

**Criterio de salida de la Fase 7:** ninguna operación normal crece en memoria ni
deja procesos colgados.

---

## Fase 8 — Tests de integración

**Objetivo:** que la clase de bug de las fases 2 y 4 no pueda volver a llegar a la
base. Estimado: 1-2 días.

Las 7 suites actuales (100 tests) son buenas y están bien elegidas: validan el
calculador de costos y el motor de precios contra el Excel, más resolución de
escalas y redondeo. Todo lógica pura, sin base de datos. Lo que queda sin cubrir
es todo lo demás: ningún test de servicio contra la base, de controller, de
transiciones de estado, de RBAC ni del cierre mensual. **Ninguno de los hallazgos
F-01 a F-09 lo habría detectado un test existente.**

No hace falta apuntar a cobertura amplia. Con los tres flujos que mueven plata
alcanza.

- [x] **F-25.a** Infraestructura: base de test (Postgres en Docker o
      Testcontainers), `jest.config` separado para integración, helper de
      `migrate deploy` + seed + truncate entre tests.
- [x] **F-25.b** **Flujo cotización**: crear con ítems PRODUCT y ADHOC, verificar
      precio, `unitCost` coherente (F-07), imputación de volumen al aceptar, y que
      un `viewer` no puede cambiar el estado (F-04).
- [x] **F-25.c** **Flujo producción**: `PLANNED → DONE` descuenta stock una sola
      vez, dos requests concurrentes no descuentan doble (F-02), y un error a
      mitad revierte todo.
- [x] **F-25.d** **Cierre mensual**: los cuatro `asOf` de F-09, idempotencia y
      suspensión por incumplimiento.
- [x] **F-25.e** **RBAC**: una tabla de (rol × endpoint × status esperado) que
      recorra los 101 endpoints. Es el test que hubiera cazado F-04 y que atrapa
      cualquier decorador mal puesto en el futuro.
- [x] **F-25.f** **Seed**: test que corre el seed dos veces seguidas y verifica que
      los permisos por rol no cambian (F-01).

**Tests / verificación**

- [ ] `pnpm test` corre unitarios + integración
- [ ] La suite de integración pasa desde una base limpia
- [ ] Revirtiendo cada fix de F-01, F-02, F-04 y F-09, el test correspondiente
      **falla** — si no falla, el test no está probando lo que dice probar

**Criterio de salida de la Fase 8:** los cuatro fixes críticos tienen un test que
los sostiene.

---

## Fase 9 — Consolidar el contrato compartido

**Objetivo:** que backend y frontend dejen de derivar. Incremental, sin fecha.

[`packages/shared/src`](../../packages/shared/src) tiene 56 líneas y un solo
consumidor en todo el repo: el formulario de login. La API no lo importa nunca.
Como consecuencia el contrato está duplicado a mano: la unión `ApiErrorCode` vive
en tres archivos (`error-codes.ts`, `api-client.ts`, `api-server.ts`), la clase
`ApiError` y `deriveCodeFromStatus` están copiadas íntegras entre los dos
fetchers, y cada componente de React vuelve a declarar la forma del DTO que
consume.

Nada de esto está roto hoy — el typecheck pasa porque las copias coinciden. Pero
es duplicación que falla en silencio: agregar un campo a un DTO del backend no
produce ningún error en web hasta que algo aparece `undefined` en pantalla.

- [x] **F-20.a** Mover `ApiErrorCode` y `deriveCodeFromStatus` a
      `packages/shared` y que los tres archivos lo importen. Es el caso más chico
      y valida el camino completo.
- [x] **F-20.b** Factorizar `ApiError` y el parseo de respuesta compartido entre
      `api-client.ts` y `api-server.ts` (hoy ~60 líneas idénticas).
- [x] **F-20.c** Mover los schemas de Zod de los controllers a `packages/shared`,
      módulo por módulo, empezando por `quotes` (el más grande y el que más
      duplicación de tipos genera en web).
- [x] **F-20.d** Derivar los DTO de respuesta desde un único lugar y que los
      componentes de React los importen en vez de redeclararlos.

**Tests / verificación**

- [ ] `pnpm typecheck` en verde tras cada módulo migrado
- [ ] Agregar un campo a un DTO del backend produce un error de tipo en web si el
      componente no lo contempla — esa es la prueba de que el contrato funciona

---

## Bitácora

Una fila por fase cerrada. Anotar lo que se desvió del plan.

| Fecha | Fase | Hallazgos cerrados | Commit | Notas |
|---|---|---|---|---|
| 2026-08-21 | 1 | F-01, F-03, F-04 | `3af4991` | El alcance de F-01 era menor de lo estimado: `seedRoles` sólo toca admin/operator/viewer, el rol `customer-portal` sobrevivía. Se corrigió también que el borrado ciego pisaba los ajustes hechos desde Admin > Roles. |
| 2026-08-21 | 2 | F-02, F-10 | `318a457` | Para F-10 se usó una tabla de contadores en vez de SEQUENCE: el prefijo lleva el año y una secuencia global no reinicia sola. Resuelve la decisión F-10.c. |
| 2026-08-21 | 3 | F-17, F-18, F-19, F-21, F-22 | `0b8d52f` | La primera corrida de ESLint reportó **44 errores**. Todos corregidos. Quedan apagadas con justificación `react-hooks/set-state-in-effect` e `immutability` (v7, compatibilidad con React Compiler): 10 sitios que son patrones correctos hoy. Adoptarlas es una migración propia — **pendiente**. |
| 2026-08-21 | 4 | F-06, F-08, F-09 | `62e6f86` | En F-08 se conservó el FORMATO de la clave `monthStart` (día 1 a medianoche UTC): guardar el instante real del inicio de mes argentino habría dejado sin matchear todas las filas existentes. |
| 2026-08-21 | 5 | F-05, F-12, F-13, F-23 (parcial) | `def9fd5` | Sanear la cabecera no alcanzaba: sin proxy real, todos comparten la IP del contenedor `web`. Se agregó bloqueo por cuenta (8 fallidos → 15 min), que no depende de la IP. |
| 2026-08-21 | 6 | F-07, F-11, F-15, F-24 | `0af9eff` | El índice único parcial de F-11 vive sólo en SQL (Prisma no los expresa); queda documentado en el schema para que no se pierda al regenerar. |
| 2026-08-21 | 7 | F-14, F-16 | `b23811d` | Además del cliente, se memoizaron por request los parámetros globales y la grilla de escalas, que se releían una vez por ítem. |
| 2026-08-21 | 8 | F-25 (parcial) | `51d2e10` | 9 tests que corren SIN base de datos (reflexión sobre metadata + Prisma mockeado) y cubren F-01, F-02 y F-04. Verificado que fallan al revertir cada fix. La suite contra Postgres queda pendiente. |
| 2026-08-21 | 9 | F-20 (parcial) | `b33b17b` | Movido el contrato de errores a shared. Verificado que agregar un código nuevo rompe el typecheck de web. Faltan los schemas de Zod y los DTO. |

---

## Fuera de alcance

Cosas que la auditoría no miró y que no cubre este plan:

- Pruebas de penetración o análisis dinámico (fue revisión estática).
- Auditoría de vulnerabilidades de dependencias (`pnpm audit`) — conviene correrlo
  aparte, sobre todo después de la limpieza de F-21.
- Accesibilidad del frontend.
- Rendimiento bajo carga real.
- Los conectores MELI / ARCA / WhatsApp, que siguen stubeados.

---

## Pendiente tras la ejecución del 2026-08-21

Lo que NO quedó hecho, y por qué. Nada de esto está bloqueado por otra cosa.

### Requiere la base de datos levantada

La ejecución se hizo sin Docker corriendo, así que ninguna verificación contra
Postgres pudo ejecutarse. Las migraciones nuevas están escritas y el schema
valida, pero **no se aplicaron**:

- [ ] `pnpm prisma migrate deploy` con las 4 migraciones nuevas
      (`document_counters`, `login_lockout`, `global_param_iva_pct`,
      `one_current_price_per_material`).
- [ ] Antes de aplicar `one_current_price_per_material`, correr la query de
      duplicados de la Fase 6: la migración los resuelve sola conservando el
      más reciente, pero conviene ver cuántos había.
- [ ] Verificaciones de la Fase 1 (seed sobre base existente), Fase 2
      (concurrencia real), Fase 3 (`whoami` en el contenedor, healthcheck en
      verde) y Fase 7 (conteo de queries, cancelación de backup).

### F-23 — rotación que rompe el entorno si se hace a medias

- [x] `API_JWT_SECRET` y `API_REFRESH_SECRET` rotados en el `.env` local.
- [ ] `POSTGRES_PASSWORD`: cambiarlo en el `.env` **no** cambia la clave del rol
      dentro del volumen de Postgres. Requiere, con la base arriba:
      ```bash
      docker compose exec db psql -U tienda3d -c "ALTER USER tienda3d WITH PASSWORD '<nueva>';"
      # y recién después actualizar POSTGRES_PASSWORD y DATABASE_URL en .env
      docker compose up -d --force-recreate api
      ```
- [ ] `SEED_ADMIN_PASSWORD`: cambiar la contraseña del admin desde la UI (el
      hash vive en `users`), y después actualizar la variable.

### F-25 — suite de integración contra Postgres

Lo que se hizo corre sin base de datos y cubre F-01, F-02 y F-04. Falta lo que
sí necesita una base:

- [ ] Infraestructura: base de test, `jest.config` de integración, helper de
      migrate + seed + truncate.
- [ ] Flujo cotización de punta a punta e imputación de volumen al aceptar.
- [ ] Cierre mensual contra datos reales.

### F-20 — el resto del contrato compartido

- [ ] Mover los schemas de Zod de los controllers a `packages/shared`, módulo
      por módulo, empezando por `quotes`.
- [ ] Derivar los DTO de respuesta desde un solo lugar.

### Deuda nueva, asumida a conciencia

- [ ] Adoptar `react-hooks/set-state-in-effect` y `react-hooks/immutability`
      (10 sitios). Hoy están apagadas con justificación en
      `apps/web/eslint.config.js`. Es una migración de compatibilidad con el
      React Compiler, con su propio testing.
