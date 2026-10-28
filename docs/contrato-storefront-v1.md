# Contrato de lectura `storefront_v1`

Cómo lee el sitio (tienda-plastik-page, `storefront/`) el catálogo que se gestiona en tienda3d. Es la
única puerta: el sitio no ve ninguna tabla del sistema. Implementar la lectura del sitio (plan F12)
tiene que ser posible leyendo solo este documento.

- **Dónde está definido:** la migración `apps/api/prisma/migrations/20261028200000_storefront_v1_views`.
- **Qué lo protege:** `apps/api/test/storefront-contract.int-spec.ts`, que fija las columnas y tipos de
  cada vista y prueba los permisos del lector. Corre en `pnpm verify`.
- **Plan:** [ecosistema-tienda-online.md](plans/ecosistema-tienda-online.md) §5.3–§5.5, fases F10–F12.

## Conexión

| Qué        | Valor                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Base       | `tienda3d` (la misma instancia de Postgres que la base `storefront`)                     |
| Rol        | `storefront_reader`; la URL completa está en el secreto `storefront_reader_database_url` |
| Esquema    | `storefront_v1`, que es su `search_path`: las vistas se nombran sin prefijo              |
| Sesión     | solo lectura, `statement_timeout = 5s`, `idle_in_transaction_session_timeout = 10s`      |
| Conexiones | hasta 10 en total (sitio y worker juntos): usar un pool chico                            |
| Permisos   | `SELECT` en las vistas de `storefront_v1`. Cualquier otra tabla da _permission denied_.  |

En el ecosistema la URL es
`postgresql://storefront_reader:<clave>@db:5432/tienda3d` (red interna, sin TLS). En RDS cambia solo el
host y se agrega `sslmode=require`.

## Qué muestra

Solo publicaciones **publicadas** con al menos una variante **vendible**. Una variante es vendible si
está activa; su tamaño o modelo (miembro) está activo; el producto del sistema detrás está activo;
tiene precio calculado; y todos sus colores y opciones están activos, incluido el color en Insumos.

Si algo deja de cumplirse, la fila desaparece de la vista en el momento: no hay estado intermedio. El
sitio no tiene que filtrar por estado ni por activo.

Ninguna vista expone costos, recetas, proveedores, markups, notas internas, clientes ni usuarios.

## Vistas

Tipos de Postgres: `text`, `integer`, `boolean` y `timestamp` (sin zona, en UTC). Los **montos son
centavos enteros** (`$ 33.800,00` → `3380000`). Los ids son cuids (texto).

### `products`

Una fila por publicación visible.

| Columna           | Tipo      | Qué es                                                              |
| ----------------- | --------- | ------------------------------------------------------------------- |
| `id`              | text      | Id de la publicación.                                               |
| `slug`            | text      | Dirección: `/producto/<slug>`. Único.                               |
| `name`            | text      |                                                                     |
| `summary`         | text      | Bajada corta (puede ser `''`).                                      |
| `description`     | text      | Formato de texto simple (ver abajo).                                |
| `seo_title`       | text      | Null: usar `name`.                                                  |
| `seo_description` | text      | Null: usar `summary`.                                               |
| `option_label`    | text      | Nombre de la elección entre tamaños o modelos ("Tamaño", "Modelo"). |
| `featured`        | boolean   | Destacada en la portada.                                            |
| `sort_order`      | integer   | Orden manual (ascendente).                                          |
| `published_at`    | timestamp | Primera publicación ("nuevos").                                     |
| `updated_at`      | timestamp | Último cambio de la ficha (no de precios ni variantes).             |

**Formato de la descripción:** los párrafos van separados por una línea en blanco y se respeta un
salto simple. Admite `**negrita**` y `*itálica*`. Las listas son líneas que empiezan con `- `. Es el
mismo que ya usa el sitio (`src/domain/rich-text.ts`).

### `variants`

Una fila por combinación vendible.

| Columna              | Tipo    | Qué es                                                                              |
| -------------------- | ------- | ----------------------------------------------------------------------------------- |
| `id`                 | text    | Id de la variante. Es lo que guarda una línea de carrito o de pedido.               |
| `product_id`         | text    | → `products.id`.                                                                    |
| `sku`                | text    | `PTK-PROD-NNNNNN-VNN`. Inmutable, único.                                            |
| `member_value_key`   | text    | Id del tamaño o modelo.                                                             |
| `member_value_label` | text    | "280", "390"; `''` si la publicación tiene un solo producto del sistema.            |
| `member_sort`        | integer | Orden del tamaño o modelo.                                                          |
| `price_cents`        | integer | Precio de Venta Directa a cliente normal, por unidad, para cualquier cantidad (D3). |
| `availability`       | text    | `MADE_TO_ORDER`, `STOCK_ONLY` o `STOCK_THEN_ORDER` (ver abajo).                     |
| `available_quantity` | integer | Stock listo para entregar (≥ 0). Null en `MADE_TO_ORDER`.                           |
| `max_per_order`      | integer | Tope por pedido (20 si el admin no puso otro).                                      |
| `lead_time_days`     | integer | Plazo de fabricación en días. Null: no informado.                                   |
| `image_id`           | text    | Foto propia de la variante (→ `images.id`) o null.                                  |
| `sort`               | integer | 1…n dentro de la publicación (por tamaño y SKU).                                    |

**Disponibilidad (D9):**

| `availability`     | Con `available_quantity > 0`                                   | Con `0`                |
| ------------------ | -------------------------------------------------------------- | ---------------------- |
| `MADE_TO_ORDER`    | — (es null): se vende siempre, hasta `max_per_order`           | igual                  |
| `STOCK_ONLY`       | hasta `min(available_quantity, max_per_order)`                 | sin stock: no se vende |
| `STOCK_THEN_ORDER` | lo que hay sale ya; el resto se fabrica, hasta `max_per_order` | se fabrica a pedido    |

Es la regla de `variantAvailability` de tienda3d (`web-catalog/domain/availability.ts`). La compra
descuenta stock por la API del sistema al registrar el pedido (F14·3).

### `variant_options`

Qué elige el cliente en cada variante: una fila por variante y por opción.

| Columna        | Tipo    | Qué es                                                                                     |
| -------------- | ------- | ------------------------------------------------------------------------------------------ |
| `variant_id`   | text    | → `variants.id`.                                                                           |
| `option_kind`  | text    | `member` (tamaño o modelo), `color` o `attribute` (opción informativa, sin precio propio). |
| `option_key`   | text    | Clave estable de la opción dentro de la publicación (`member` para el tamaño).             |
| `option_label` | text    | "Tamaño", "Color", "Tipo de hoja".                                                         |
| `value_key`    | text    | Clave estable del valor: id del miembro, id del color o slug del valor.                    |
| `value_label`  | text    | "280", "Negro", "Punto".                                                                   |
| `color_hex`    | text    | `#RRGGBB` en los colores (puede ser null); null en el resto.                               |
| `option_sort`  | integer | Orden de las opciones: tamaño primero, después colores, después las informativas.          |
| `value_sort`   | integer | Orden de los valores dentro de la opción.                                                  |

La opción `member` aparece **solo si la publicación tiene más de un tamaño a la venta**. Dos variantes
de la misma publicación nunca tienen las mismas opciones. Para armar el selector: agrupar por
`option_key` y ordenar por `option_sort` y `value_sort`. Una combinación que no está en `variants` no
se puede comprar.

### `images`

Fotos de las publicaciones visibles.

| Columna           | Tipo    | Qué es                                                                                         |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `id`              | text    |                                                                                                |
| `product_id`      | text    | → `products.id`.                                                                               |
| `path`            | text    | Relativo al volumen `media` (`catalog/<id>/<uuid>.webp`), montado de solo lectura en el sitio. |
| `alt`             | text    | Puede ser `''`.                                                                                |
| `width`, `height` | integer | Píxeles (WebP de 2000 px de lado como máximo).                                                 |
| `position`        | integer | Orden de la galería; la menor es la portada.                                                   |
| `color_value_key` | text    | Foto de un color (→ `variant_options.value_key` de un `color`) o null.                         |

El nombre del archivo es un uuid y no cambia: se puede cachear como inmutable.

### `categories` y `product_categories`

Categorías de la vidriera (dos niveles), aparte de las de precios del sistema.

| `categories`  | Tipo    | Qué es                                                   |
| ------------- | ------- | -------------------------------------------------------- |
| `id`          | text    |                                                          |
| `slug`        | text    | Único.                                                   |
| `name`        | text    |                                                          |
| `description` | text    | Puede ser `''`.                                          |
| `parent_id`   | text    | Null en las de primer nivel.                             |
| `image_path`  | text    | Foto de la tarjeta, relativa al volumen `media`, o null. |
| `sort_order`  | integer |                                                          |

Solo aparecen las activas. Una hija se muestra solo si su madre también está activa. `product_categories`
(`product_id`, `category_id`) relaciona publicaciones visibles con categorías visibles.

### `slug_redirects`

| Columna        | Tipo | Qué es                                             |
| -------------- | ---- | -------------------------------------------------- |
| `old_slug`     | text | Una dirección vieja de una publicación visible.    |
| `product_slug` | text | La actual: redirigir con 301 a `/producto/<esta>`. |

### `store_settings`

Siempre **una fila** (con los valores por defecto si el admin todavía no guardó nada).

| Columna                      | Tipo    | Qué es                                              |
| ---------------------------- | ------- | --------------------------------------------------- |
| `shipping_flat_rate_cents`   | integer | Envío con tarifa plana. Null: no se ofrece envío.   |
| `free_shipping_from_cents`   | integer | Envío gratis desde ese total. Null: nunca.          |
| `pickup_enabled`             | boolean | Retiro por el taller.                               |
| `pickup_instructions`        | text    |                                                     |
| `bank_transfer_enabled`      | boolean | Se acepta transferencia (D7).                       |
| `bank_transfer_instructions` | text    | CBU o alias; no vacío si está habilitada.           |
| `notification_email`         | text    | Adónde avisar de cada pedido nuevo (`''`: a nadie). |

Siempre hay retiro o envío (el sistema no deja guardar los dos apagados).

## Cuándo cambia

El sistema avisa con el evento `catalog.changed {scope, ids}` (F11, firmado como se describe abajo):

| `scope`    | `ids`                                    | Qué revalidar                       |
| ---------- | ---------------------------------------- | ----------------------------------- |
| `product`  | slugs afectados (con el viejo si cambió) | la ficha de cada uno y los listados |
| `catalog`  | `[]`                                     | todo el catálogo                    |
| `settings` | `[]`                                     | lo que lee `store_settings`         |

Como respaldo, el sitio tiene que tolerar un evento perdido: un `cacheLife` de 5 minutos alcanza
(F12·2).

## Versionado

- Un cambio **aditivo** (una vista o una columna nueva) va en `storefront_v1` y se suma acá y al test.
- Un cambio que **rompe** (quitar o renombrar una columna, cambiar su tipo o su significado) crea
  `storefront_v2`. Las dos versiones conviven hasta que el sitio migre, y después se borra la vieja.
- Una migración que toque una columna usada por estas vistas tiene que recrearlas: Postgres no la deja
  borrar mientras una vista la use. Los permisos del lector se reaplican solos en cada migración
  (`prisma/grants-reader.sql`).

## Firma de los avisos (F11)

Los eventos entre los dos sistemas (`catalog.changed`, pedidos, pagos) viajan por HTTP con estas
cabeceras:

```
X-TP-Event-Id:  <uuid>
X-TP-Timestamp: <segundos Unix>
X-TP-Signature: v1=<hex(HMAC-SHA256(secreto, timestamp + "." + cuerpo))>
```

- **Cuerpo:** los bytes exactos del cuerpo HTTP en UTF-8. Se firma lo que se manda y se verifica lo que
  llega, sin volver a serializar el JSON.
- **Rechazo:** firma inválida, o timestamp a más de 5 minutos del reloj del receptor.
- **Comparación:** en tiempo constante (`timingSafeEqual`).
- **Deduplicación:** por `X-TP-Event-Id` (tabla `inbound_events`).
- **Secretos:** uno por sentido (`events_secret_t3d_to_sf`, `events_secret_sf_to_t3d`).

**Vectores de prueba.** Las dos implementaciones tienen que reproducirlos. Están calculados con Node
(`crypto.createHmac`) y verificados con `openssl dgst -sha256 -hmac`.

| Secreto            | Timestamp    | Cuerpo                                                                     | `X-TP-Signature`                                                      |
| ------------------ | ------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `tp-test-secret-1` | `1793200000` | `{"event":"catalog.changed","scope":"product","ids":["lampara-trapecio"]}` | `v1=eac227acb4424f19f7aee8e9de1e44b106e6f1731cc5930d99c79289de2e6d8c` |
| `tp-test-secret-1` | `1793200000` | _(vacío)_                                                                  | `v1=404e8b1ad6acdb72b6a875135c22b6b580b9df16dcf8a98bce2a938d910b7550` |
| `tp-test-secret-2` | `1793200123` | `{"event":"order.created","externalId":"TP-000123","note":"Lámpara año"}`  | `v1=6c7224609ddf8dc81ccc5bb46c4fddc77d0552ed957311f4f3adbe86623c083b` |

El tercero fija la codificación: "Lámpara año" se firma en UTF-8. Firmar en latin-1 da otra firma.
