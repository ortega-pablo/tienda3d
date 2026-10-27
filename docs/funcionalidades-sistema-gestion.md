# Plastik 3D — Sistema de cotización, costeo y producción

> Informe de funcionalidades · Agosto 2026
> Documento comercial y técnico. Todo lo que se describe está implementado y
> funcionando salvo lo que se marca explícitamente como *preparado* o *pendiente*
> en la sección [Estado de madurez](#estado-de-madurez).

---

## 1. Resumen ejecutivo

Plastik 3D es un sistema de gestión integral para talleres de manufactura
aditiva (impresión 3D). Reemplaza la planilla de cálculo con la que se coteja
—de hecho, el motor de costos está **validado test a test contra esa planilla**—
y le agrega lo que una planilla no puede dar: trazabilidad, control de stock,
precios por canal de venta, gestión de clientes mayoristas y un registro de
auditoría de quién cambió qué.

**El problema que resuelve.** Cotizar una pieza impresa en 3D no es aplicar un
margen sobre el material. Hay que imputar el filamento con su desperdicio, la
amortización de la impresora, la energía que consume, la mano de obra de armado,
el prorrateo de marketing, la contingencia, la reinversión, la comisión del
canal donde se vende y el régimen tributario. Hacerlo a mano en cada pedido es
lento y propenso a errores; hacerlo en una planilla funciona hasta que el
negocio tiene tres canales de venta, clientes con precios distintos y alguien
que necesita saber cuánto stock queda.

**Qué obtiene el taller.**

| | |
|---|---|
| **Un precio defendible en 30 segundos** | Se carga la pieza y el sistema devuelve costo, precio por canal, ganancia de bolsillo y el desglose completo de cómo llegó a ese número. |
| **Ganancia real, no aparente** | El markup se aplica solo sobre lo que el taller fabrica. Los insumos comprados pasan con su propio recargo de reposición, así que agregar un insumo caro no infla artificialmente la ganancia reportada. |
| **Precios distintos por canal, sin recalcular** | El mismo producto cotizado en Venta Directa, MercadoLibre o efectivo sin factura arroja precios distintos y **la misma ganancia de bolsillo**. |
| **Stock que se descuenta solo** | Al cerrar una orden de producción, el consumo de filamento e insumos se imputa automáticamente, con su movimiento registrado. |
| **Clientes mayoristas con reglas propias** | Catálogos restringidos, pisos de escala permanentes, exenciones de comisión o régimen, y compromisos mensuales de volumen con suspensión automática si no se cumplen. |
| **Documentos listos para el cliente** | Cotización en PDF con desglose por ítem y catálogo personalizado en PDF por cliente, con sus precios. |

**En números.**

| Métrica | Valor |
|---|---|
| Módulos de negocio | 22 |
| Endpoints de API | 101 |
| Pantallas de la aplicación | 34 |
| Modelos de datos | 30 tablas · 13 enums |
| Migraciones versionadas | 29 |
| Permisos atómicos | 29 de staff + 3 de portal |
| Tests automatizados | 155 (131 unitarios + 24 de integración contra Postgres real) |
| Código | 242 archivos TypeScript · ~31.700 líneas |

---

## 2. El cotizador — tres flujos, un solo motor

El corazón del sistema. Los tres flujos comparten el mismo motor de costeo y
precios, así que un cambio en un parámetro global se refleja en los tres sin
riesgo de que uno quede desactualizado.

### 2.1 Cotización de catálogo

Para productos que el taller ya tiene definidos con su receta.

- Selección de producto del catálogo y cantidad; el precio sale de la escala
  que cubre esa cantidad.
- **Múltiples ítems por cotización**, con subtotal, descuento global y total.
- Cliente opcional: si se elige un cliente persistido, el sistema valida que
  tenga acceso al producto y aplica su perfil de precios (markup propio, piso de
  escala, exenciones).
- Cliente ocasional (*walk-in*): nombre, mail y teléfono como texto libre, sin
  crear ficha.
- **Vista previa en vivo** antes de guardar: costo unitario, precio unitario,
  ganancia por unidad y total de línea.
- Checkbox **"operación sin factura"**, que cambia el canal aplicado y por lo
  tanto el régimen tributario.

### 2.2 Cotización a medida (instantánea)

Para el pedido que entra por WhatsApp y no está en el catálogo. No requiere
crear un producto.

- Carga directa de **piezas a imprimir** (nombre, gramos, minutos de impresión y
  filamento) e **insumos** (cantidad de cada material).
- Tiempos de armado y de gestión.
- **Cargo de diseño 3D**: se cargan los minutos y el sistema calcula un cargo
  plano por línea usando la tarifa horaria configurada. No escala con la
  cantidad —diseñar una vez cuesta lo mismo pida uno o cien— pero sí paga
  comisión de canal y régimen igual que el resto del precio.
- **Agrupación por grupos**: una cotización a medida puede partirse en varios
  ítems (por ejemplo, "cuerpo", "tapa", "accesorios") con desglose de precio por
  grupo en la vista previa.
- Snapshot de los nombres de filamentos e insumos al guardar: si un material se
  da de baja después, el documento histórico sigue mostrando lo que el cliente
  vio.

### 2.3 Cotización de llaveros

Un flujo especializado, porque los llaveros tienen una economía distinta: se
imprimen en placa y el precio por unidad cae fuerte con la cantidad.

- **Escala global de markup** por cantidad, editable por el administrador:

  | Cantidad | Markup |
  |---|---|
  | 1 – 4 | 100 % |
  | 5 – 24 | 80 % |
  | 25 – 49 | 60 % |
  | 50 – 99 | 50 % |
  | 100 o más | 35 % |

- **Doble base de costo**: para 1–4 unidades se usa la pieza individual; para 5
  o más, la placa completa dividida por el tamaño de tanda configurado. Los
  insumos y los tiempos de armado no se dividen, porque son por unidad.
- **Matriz comparativa**: con un solo cálculo, el vendedor ve el precio unitario
  y el total en *todas* las escalas a la vez. Sirve para mostrarle al cliente el
  incentivo de saltar de escala sin recalcular pedido por pedido.
- **Valores por defecto configurables**: pieza, gramaje, minutos, filamento,
  insumos y tiempos se precargan desde una configuración central, y el vendedor
  los ajusta en cada cotización.

### 2.4 Ciclo de vida de la cotización

```
BORRADOR ──► ENVIADA ──► ACEPTADA
    │           │  └────► RECHAZADA ──┐
    │           └───────► VENCIDA ─────┼──► (vuelta a BORRADOR)
    └───────────────────────────────────┘
```

- Transiciones validadas: no se puede saltar de borrador a aceptada, y
  **aceptada es terminal**.
- **Códigos correlativos** por tipo y año: `Q-2026-0001` para catálogo,
  `R-2026-0001` para instantáneas, `OP-2026-0001` para producción. Se asignan de
  forma atómica, así que dos personas cotizando a la vez nunca reciben el mismo
  número.
- **Validez automática**: 15 días hábiles desde la emisión, contando de lunes a
  viernes.
- **Solo los borradores se pueden eliminar**, y el borrado queda auditado.
- **"Usar como base"**: recotizar desde una cotización existente, precargando
  todos sus valores en el formulario correcto según su formato.

### 2.5 Documentos y trazabilidad

- **PDF de cotización** con el logo del taller, datos del cliente, itemizado con
  desglose de componentes por ítem, cargo de diseño separado, subtotal,
  descuento y total.
- **Desglose "por qué este precio"** (solo administradores): cada ítem guarda un
  snapshot completo del cálculo —filamento, máquina, mano de obra, contingencia,
  reinversión, markup aplicado, comisión, régimen, IVA y el paso de redondeo— tal
  como estaba al firmarse. Si los costos cambian después, el documento sigue
  explicando el precio que se cotizó.
- **Advertencias visibles junto al precio**: filamento sin precio vigente,
  comisión de marketplace sin cargar, o comisión más impuestos por encima del
  100 %. No son avisos que se desvanecen: quedan a la vista mientras el precio
  está a la vista.

---

## 3. Motor de costos

El cálculo que respalda cada número, validado contra la planilla original del
taller mediante tests automatizados. Si alguien modifica una fórmula sin
querer, los tests fallan.

### 3.1 Componentes del costo

| Componente | Cómo se calcula |
|---|---|
| **Filamento** | `(gramos / 1000) × precio_kg`, más su porcentaje de desperdicio, más su recargo de reposición de stock. |
| **Hora-máquina** | Amortización `(costo − valor residual) / vida útil en horas`, más energía `(W / 1000) × costo_kWh` con recargo configurable, más mantenimiento `anual / horas de uso anuales`. |
| **Mano de obra** | `(minutos de armado + minutos de gestión) / 60 × valor hora`, con recargo extra configurable. |
| **Marketing** | Presupuesto mensual del producto dividido por sus unidades estimadas por mes. |
| **Contingencia y reinversión** | Porcentajes globales aplicados sobre la suma anterior. |
| **Otros insumos** | `cantidad × precio vigente`, más desperdicio, más recargo de reposición propio de cada insumo. |

### 3.2 La decisión de diseño que lo distingue

El sistema separa el costo en dos bloques:

```
precio_de_fabricación = filamento + máquina + mano de obra + marketing + provisiones
costo_total           = precio_de_fabricación + otros insumos (ya recompuestos)
```

**El markup se aplica solo sobre el precio de fabricación.** Los insumos
comprados —herrajes, packaging, hojas— pasan al precio *después* del margen,
recompuestos por su propio porcentaje de reposición.

*Por qué importa comercialmente:* la ganancia que reporta el sistema es plata
que entra al bolsillo, no un número inflado por revender insumos. Y agregar un
insumo caro a un producto no cambia mágicamente la rentabilidad aparente del
trabajo del taller.

---

## 4. Motor de precios

### 4.1 Canales de venta

El mismo producto vale distinto según dónde se venda. El sistema modela cuatro
tipos de canal, y trae tres configurados de fábrica:

| Canal | Tipo | Comportamiento |
|---|---|---|
| **Venta Directa** | `DIRECT_SALE` | Comisión desde un parámetro global único; aplica régimen. |
| **MercadoLibre** | `MARKETPLACE` | Comisión **obligatoria por producto** (varía por categoría del marketplace). Si falta, el sistema avisa en vez de calcular mal. |
| **Efectivo** | `CASH` | Comisión cero y sin régimen: opera sin factura. |
| *(definibles)* | `CUSTOM` | Canales propios con todos los campos libres. |

Los canales se crean y editan desde la aplicación. Antes de desactivar o borrar
uno, el sistema muestra su **impacto**: cuántos productos lo tienen habilitado,
cuántas cotizaciones lo usan y una muestra de los productos afectados.

La fórmula de precio:

```
ganancia       = precio_de_fabricación × markup%
pre_comisión   = precio_de_fabricación + ganancia + otros insumos
precio_neto    = pre_comisión / (1 − comisión% − régimen%)
precio_final   = precio_neto × (1 + IVA%)   ← redondeado hacia arriba
```

**Consecuencia comercial:** la ganancia de bolsillo es **la misma en todos los
canales**. Lo que cambia es cuánto hay que cobrar para conservarla después de
que el canal se lleve su parte. Esa es exactamente la pregunta que un taller
necesita responder para decidir dónde le conviene vender.

### 4.2 Escalas de precio por categoría y canal

- Escalas de cantidad (`1–9`, `10–49`, `50+`…) definidas **por categoría y por
  canal**: la misma categoría puede tener escalas distintas en Venta Directa y
  en MercadoLibre.
- **Herencia de subcategoría a categoría padre**, con regla explícita todo-o-nada
  para evitar mezclas ambiguas.
- Markup base de categoría como respaldo cuando ninguna escala cubre la cantidad.

### 4.3 Redondeo comercial

Los precios finales se redondean **hacia arriba** al múltiplo configurado (por
defecto $50), de modo que todo lo que ve el cliente termina en cifras redondas y
consistentes entre sí: precio unitario, total de línea y total del documento.

Los costos, márgenes y valores intermedios quedan **exactos**: el redondeo nunca
contamina los datos de gestión.

### 4.4 Configuración fiscal

- **Modo simple** (el que usa el taller hoy): régimen unificado como porcentaje
  global.
- **Modo detallado** (implementado, activable por canal): IIBB, retenciones de
  IVA, IIBB y ganancias por separado, y tipo de comprobante.
- **Alícuota de IVA configurable** desde la pantalla de parámetros, sin
  necesidad de tocar código ni redesplegar.

---

## 5. Catálogo

### 5.1 Productos

- Ficha con nombre, **SKU autogenerado** con patrón `PTK-PROD-NNNNNN` e
  inmutable, descripción visible al cliente y **notas internas** que nunca salen
  al catálogo.
- **Receta de piezas impresas**: nombre, gramos, minutos de impresión y
  filamento por defecto.
- **Receta de insumos**: cantidad de cada material no impreso.
- Tiempos de armado y de gestión, presupuesto de marketing y unidades estimadas
  por mes.
- Impresora asignada.
- **Canales habilitados** por producto, con comisión propia donde el canal lo
  requiere.
- **Tipo de producto**: estándar o llavero. Los llaveros guardan dos juegos de
  piezas —individual y de tanda— y usan la escala global de llaveros.
- **Panel de precios en vivo** dentro del editor: costo desglosado y precio
  resultante en cada canal y escala, actualizado mientras se edita.

### 5.2 Categorías

- Jerarquía de dos niveles: categoría padre y subcategorías.
- Markup base propio, con herencia al padre cuando no está definido.
- Escalas de precio por canal, editables con vista de pestañas.

### 5.3 Insumos y stock

- Tipos: filamento, hoja, packaging, herraje y otros. Unidades: kg, gramo,
  unidad, resma, metro y litro.
- **Jerarquía padre/variante para filamentos**: el padre agrupa la línea de
  producto (por ejemplo "PLA Grilon") y concentra precio, densidad y desperdicio;
  las variantes son los colores y llevan su propio stock. Evita cargar el precio
  cinco veces para cinco colores del mismo filamento.
- **Porcentaje de desperdicio** y **recargo de reposición** por insumo.
- **Stock actual, stock mínimo y alerta configurable** por insumo.
- Ajustes manuales de stock con motivo registrado.
- Historial completo de movimientos.

### 5.4 Proveedores y precios

- Ficha de proveedor con contacto, teléfono, mail y notas.
- **Historial de precios por insumo y proveedor**, con fecha de registro, enlace
  de compra, plazo de entrega y notas.
- **Carga por paquete**: se ingresa "resma de 500 hojas a $17.844" y el sistema
  deriva el precio unitario.
- **Un solo precio vigente por insumo**, garantizado por la base de datos: el
  costeo nunca puede quedar ambiguo.

---

## 6. Clientes B2B

El módulo más profundo del sistema, para talleres que venden a revendedores,
consignatarios y cuentas especiales.

### 6.1 Tipos de cliente

| Tipo | Catálogo | Uso típico |
|---|---|---|
| **Mayorista** | Categorías habilitadas explícitamente | Revendedor que compra por volumen. |
| **Consignación** | Categorías habilitadas explícitamente | Local que exhibe y liquida lo vendido. |
| **Especial** | Productos puntuales asignados uno a uno | Cuenta con acuerdo a medida. |
| **Estándar** | Sin ficha persistida | Cliente ocasional de mostrador. |

### 6.2 Reglas de precio por cliente

Cada cliente puede tener:

- **Piso de escala permanente** por categoría: el cliente paga siempre como si
  comprara al menos N unidades, aunque compre menos.
- **Markup propio por producto**, que pisa cualquier otra regla.
- **Exención de comisión de canal**: útil cuando el cliente no llega vía
  marketplace.
- **Exención de régimen tributario**.
- **Exclusión de marketing y de reinversión** del costo, para acuerdos donde
  esos conceptos no corresponden.

### 6.3 Compromisos mensuales y suspensión automática

- Cada categoría asociada a un cliente puede llevar un **compromiso de unidades
  por mes**.
- El sistema **imputa automáticamente** las unidades al aceptar una cotización,
  atribuyéndolas a la categoría correcta (con resolución de subcategoría a
  padre para evitar doble conteo).
- Un **cierre mensual automático** evalúa el cumplimiento: si el cliente no
  llegó al compromiso, **suspende su condición de mayorista en esa categoría**
  —de forma granular, no para toda la cuenta— y deja el registro en auditoría.
- La suspensión es reversible manualmente por un administrador.
- Barra de progreso del mes en curso en la ficha del cliente.

### 6.4 Catálogo personalizado

- **Vista de catálogo por cliente**: solo los productos que puede comprar, con
  *sus* precios y sus escalas.
- **Exportación a PDF** del catálogo personalizado, lista para enviar.
- **Matriz de precios**: comparación producto por producto de lo que paga ese
  cliente frente al precio de lista.
- **Historial**: cotizaciones y volúmenes mensuales de la cuenta.

---

## 7. Producción y stock

- **Órdenes de producción** con código correlativo, producto, cantidad y
  snapshot del costo total al momento de crearla.
- **Selección de color por pieza**: cuando el filamento por defecto es un padre
  con variantes, el sistema **exige** elegir el color concreto, y valida que
  pertenezca a esa línea de filamento y esté activo.
- **Vista previa de consumo** antes de ejecutar: qué insumos y cuánto de cada
  uno, con desperdicio incluido.
- Estados: planificada → en curso → terminada, con cancelación disponible.
- **Al terminar, el stock se descuenta automáticamente** y queda un movimiento
  registrado por insumo, referenciando la orden.
- El descuento y el cambio de estado son **atómicos**: o se aplican los dos o no
  se aplica ninguno, y dos operarios cerrando la misma orden a la vez no
  descuentan doble.
- Registro de movimientos consultable y exportable.

---

## 8. Panel de control y reportes

**Panel principal**, con indicadores del mes en curso:

- Cotizaciones del mes: cantidad y monto total.
- Distribución de cotizaciones por estado.
- Producciones activas y del mes, con costo.
- **Valor total del stock**, calculado con los precios vigentes.
- **Alertas de stock bajo**, comparando existencia contra mínimo.
- Ranking de productos más cotizados y más producidos.

**Exportaciones a CSV**, listas para abrir en Excel:

- Cotizaciones con cliente, canal, estado, subtotal, descuento y total.
- Fotografía del stock actual con valorización.
- Movimientos de stock con insumo, tipo, cantidad, orden y usuario.

---

## 9. Administración y seguridad

### 9.1 Usuarios, roles y permisos

- **29 permisos atómicos** (`material:read`, `quote:create`, `parameter:write`,
  `role:manage`…) que se combinan libremente.
- **Roles editables desde la aplicación**, sin redespliegue. Tres roles base
  sembrados: administrador, operador y solo lectura.
- Alta de usuarios, cambio de rol, activación y desactivación, y reseteo de
  contraseña. Cambiar la contraseña **revoca todas las sesiones activas** de ese
  usuario.
- Permiso sensible separado para ver precios de **operaciones sin factura**.

### 9.2 Seguridad

- Autenticación con **contraseñas Argon2** y sesión en cookies `httpOnly`, que
  el navegador no puede leer desde JavaScript.
- **Rotación de tokens de refresco** con revocación del anterior y hash
  almacenado en base, nunca el token en claro.
- **Bloqueo de cuenta por intentos fallidos**, que no depende de la dirección IP
  y por lo tanto no se evade cambiando de red.
- El navegador **nunca habla directo con la API**: pasa por un proxy que sanea
  las cabeceras de reenvío y mantiene las cookies en el dominio de la
  aplicación.
- Cabeceras de seguridad HTTP, límite de tamaño de petición y límite de tasa.
- Validación al arranque que **impide levantar en producción con secretos de
  ejemplo** o demasiado cortos.
- Los errores internos no filtran detalles de la base ni del servidor al cliente.
- La aplicación corre con un usuario sin privilegios dentro del contenedor.

### 9.3 Auditoría

Registro inmutable de quién hizo qué y cuándo, con el estado anterior y
posterior de cada cambio. Cubre cambios de estado de cotizaciones y órdenes,
borrados, ajustes de parámetros, suspensiones automáticas de clientes y
descargas de backup. Consultable con filtros por entidad y por usuario.

### 9.4 Parámetros globales

Editables desde la aplicación, sin tocar código: costo del kWh y su recargo,
valor hora de mano de obra y su recargo, valor hora de diseño 3D, contingencia,
reinversión, régimen unificado, comisión de venta directa, **alícuota de IVA**,
paso de redondeo de precios, markup por defecto de cotizaciones a medida y
tamaño de tanda de llaveros.

Cada parámetro tiene su descripción en pantalla y validaciones que bloquean
valores imposibles.

### 9.5 Respaldo de la base

Botón **"Hacer backup ahora"** que genera un volcado comprimido en formato
nativo de PostgreSQL y lo descarga al navegador. No se guarda nada en el
servidor: el usuario elige dónde archivarlo, típicamente una carpeta
sincronizada a la nube. Cada backup queda registrado en auditoría con el usuario
que lo pidió.

### 9.6 Documentación incorporada

La pantalla **"Métodos de cálculo"** documenta dentro de la propia aplicación
todas las fórmulas en uso, con los valores de los parámetros vigentes
interpolados. Sirve como respaldo ante el contador y como referencia para el
equipo.

---

## 10. Experiencia de uso

- **Interfaz en español rioplatense**, con la terminología del taller.
- **Modo claro y oscuro**, con el tema centralizado en un único archivo de
  variables: recolorear todo el sistema es editar un archivo.
- **Navegación filtrada por permisos**: cada usuario ve solo lo que puede usar.
- **Modo edición explícito** en las pantallas de configuración, para evitar
  cambios accidentales sobre datos sensibles.
- Confirmaciones para acciones destructivas.
- Mensajes de error en castellano y accionables, no códigos técnicos.
- Diseño responsive.

---

## 11. Arquitectura y tecnología

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 |
| Backend | NestJS 11 · TypeScript · Zod |
| Base de datos | PostgreSQL 16 · Prisma ORM |
| Documentos | PDFKit (generación en servidor) |
| Empaquetado | Docker Compose · monorepo pnpm |

**Decisiones que importan a mediano plazo:**

- **Contrato compartido**: los tipos y validaciones viajan en un paquete común.
  Si el backend cambia la forma de un dato y el frontend no lo contempla, **el
  proyecto no compila**. Las discrepancias se detectan antes de desplegar, no en
  producción.
- **Motor de dominio aislado**: el cálculo de costos y precios son clases puras,
  sin dependencias de framework ni base de datos. Se pueden probar, auditar y
  portar.
- **Migraciones versionadas**: 29 migraciones que describen la evolución del
  esquema. La base se reconstruye desde cero de forma reproducible.
- **Preparado para la nube**: ambas aplicaciones compilan a artefactos
  autocontenidos. El camino a AWS —RDS, ECS Fargate, S3, Secrets Manager,
  CloudWatch— está documentado en el repositorio.

**Calidad verificable:**

- 131 tests unitarios, incluidos los que validan el motor contra la planilla
  original.
- 24 tests de integración contra una base PostgreSQL real, que ejercitan
  transacciones, concurrencia y restricciones de integridad.
- Verificación de tipos y linter en verde en todo el monorepo.
- Tests que impiden regresiones de permisos: ninguna operación que modifica
  datos puede quedar protegida solo por un permiso de lectura.

---

## 12. Instalación y operación

**Levantar el sistema completo:**

```bash
cp .env.example .env      # configurar credenciales
docker compose up --build
```

Tres contenedores: base de datos, API y aplicación web. Las migraciones se
aplican solas al arrancar.

**Requisitos:** una máquina con Docker. Corre en la computadora del taller sin
depender de internet, o en un servidor en la nube sin cambios de código.

**Respaldos:** además del botón manual, el repositorio documenta la línea de
`cron` para un volcado automático diario.

---

## 13. Estado de madurez

Un informe honesto vale más que uno optimista. Este es el estado real:

### Listo y en uso

Cotizador en sus tres flujos · motor de costos y precios · catálogo completo ·
clientes B2B con compromisos y catálogo personalizado · producción y stock ·
panel y reportes · usuarios, roles y auditoría · parámetros · respaldos · PDFs.

### Preparado, pendiente de activación

- **Modo fiscal detallado** (IIBB y retenciones desglosadas): implementado en el
  motor y activable por canal. El taller opera hoy en modo simple.
- **Conectores externos** — MercadoLibre, ARCA/AFIP y WhatsApp Business: la
  estructura, los flags de configuración y la pantalla de estado están
  construidos, pero **la integración real no está implementada**. Hoy son
  conectores inactivos que declaran su estado.

### En el plan, no construido

- **Portal de cliente**: acceso externo para que el cliente vea su catálogo y
  genere pedidos por sí mismo. El modelo de datos y los permisos ya lo
  contemplan (cuentas de portal vinculadas a la ficha del cliente); falta la
  interfaz.
- **Pruebas de extremo a extremo** con navegador automatizado.
- **Notificaciones internas** y bus de eventos, para cuando el equipo crezca.

### Trabajo técnico en curso

Una auditoría de código realizada en agosto de 2026 relevó 25 hallazgos, y
ejecutar el plan de corrección —levantando el sistema y corriendo las
migraciones contra una base real— descubrió 5 adicionales que ninguna revisión
estática iba a encontrar. **28 de los 30 están corregidos** y verificados con
tests que fallan si se revierte el arreglo.

Quedan dos frentes abiertos, ninguno de los cuales afecta la operación actual
del taller: la construcción de la imagen de producción del frontend, y la
rotación de dos credenciales que requiere coordinarse con una ventana de
mantenimiento. El detalle completo, con bitácora por fase, está versionado en
el repositorio.

---

## 14. Por qué este sistema y no una planilla

| | Planilla | Plastik 3D |
|---|---|---|
| Cálculo de costo | Manual, replicado por producto | Automático, una sola fórmula auditada |
| Precio por canal | Una columna por canal, mantenida a mano | Motor que resuelve comisión y régimen por canal |
| Ganancia real | Difícil de aislar del costo de insumos | Separada por diseño, fija entre canales |
| Stock | Aparte, si existe | Se descuenta solo al producir |
| Clientes con precios propios | Una planilla por cliente | Perfil de reglas, catálogo y compromisos |
| Quién cambió qué | No se sabe | Registro de auditoría completo |
| Documentos al cliente | Copiar y pegar | PDF de cotización y de catálogo |
| Varias personas a la vez | Se pisan | Usuarios, roles y control de concurrencia |
| Historial de un precio | Se perdió al sobrescribir | Snapshot del cálculo en cada cotización |

---

*Documento generado a partir del código fuente del sistema. Las cifras de
módulos, endpoints, tests y modelos de datos son recuentos directos sobre el
repositorio.*
