# Contrato del tablero — Unificación Tienda Plastik

Lo lee la skill `/mec-global:tablero`. La mecánica está en la skill; acá, lo propio de este tablero.

## Coordenadas

|                  |                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Tablero          | <https://github.com/users/ortega-pablo/projects/2>                                           |
| Owner / número   | ortega-pablo / 2                                                                             |
| Repo del tablero | ortega-pablo/tienda3d                                                                        |
| Repos vinculados | ortega-pablo/tienda3d · ortega-pablo/tienda-plastik-page · ortega-pablo/tienda-plastik-infra |

## Fuente

fuente: documentos
cierre: PR mergeado
ramas: feat/<id>-<slug>

Manda `docs/plans/ecosistema-tienda-online.md` de este repo, leído de `origin/unificacion` (la rama
por defecto mientras dure la unificación). De cada tarea se leen el título, **Para qué**, **Qué
hacer** y **Cierra cuando** de §6; de cada fase, la fila de la tabla de §6. Si el tablero los
contradice, el tablero está desactualizado.

## Tipos de item

| Tipo  | Dónde vive el issue                                                                                                                                                               | De dónde sale                                 | Cuándo nace                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| Fase  | ortega-pablo/tienda3d                                                                                                                                                             | una fila de la tabla de fases de §6 (F0–F21)  | F0–F16 ya; F21 el 2026-10-29 (D18); F17–F20 cuando F16·5 decide "sí" |
| Tarea | el repo donde aterriza su PR, según la etiqueta del título: `[t3d]` → tienda3d, `[sf]` → tienda-plastik-page, `[infra]` → tienda-plastik-infra. Si tiene varias, el de la primera | un bloque `- [ ] **F<n>·<m> [repo] …**` de §6 | cuando tiene "Cierra cuando"                                         |

## Qué nunca va al tablero

El relevamiento (§4), las decisiones (§2 y §3), la arquitectura (§5), los riesgos (§7), lo que
queda fuera de alcance (§8), la bitácora (§9) y los bloques **Verificación** de cada fase: son el
criterio de cierre de la fase, no trabajo.

## Los títulos

    [F5]    Modelo del catálogo web                                ← fase
    [F5·7]  El admin publica u oculta un producto con un botón     ← tarea

El título de la tarea es el del plan sin la etiqueta de repo.

## Jerarquía

Tarea → sub-issue de su fase (cross-repo). La fase sigue a sus hijos.

## Los campos

| Campo         | Valores                                                             | Para qué                                                  |
| ------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| `Status`      | Por hacer · En curso · En revisión · Bloqueada · Descartada · Hecha |                                                           |
| `Tipo`        | Fase · Tarea                                                        |                                                           |
| `Fase`        | F0 … F21                                                            | agrupar                                                   |
| `Documento`   | texto: `docs/plans/ecosistema-tienda-online.md §6 F<n>`             |                                                           |
| `Repositorio` | texto: `owner/repo`                                                 | dónde aterriza la tarea                                   |
| `Rama`        | texto                                                               | la rama donde se mergea (`unificacion` o `main` en infra) |
| `Depende de`  | texto: prefijos                                                     | dependencias declaradas en el plan                        |
| `Release`     | texto                                                               | en qué release llegó                                      |

`Bloqueada`: la frena una decisión abierta de §3 (D8, D11, D12) o una respuesta de la dueña.
`Descartada`: no se hizo; nunca cuenta como `Hecha`.

## El reloj

reloj: sí

| Campo               | Rol                                                  |
| ------------------- | ---------------------------------------------------- |
| `Inicio`            | la fecha en que pasó a En curso                      |
| `hs mín` / `hs máx` | el rango estimado; vacío hasta que Pablo lo confirme |
| `hs reales`         | acumulador, admite decimales                         |

Las tareas las ejecuta Claude: el tramo imputado es el tiempo transcurrido entre el arranque y el
paso a revisión, y el comentario del tramo lo dice ("⏱ … · ejecutado por Claude").

## Workflows nativos encendidos

Activados por Pablo en la web el 2026-10-28:

- **Item added to project** → `Status = Por hacer`.
- **Item closed** → `Status = Hecha`.
- **Pull request merged** → `Status = Hecha`.
- **Auto-add sub-issues to project**.

Vistas: **Por fase** (agrupada por Fase, con las sumas de hs mín/máx/reales) y **Por responsable**
(agrupada por Assignees); la "View 1" de fábrica se borró.

La skill igual fija `Status` y los demás campos en cada paso (arranque, revisión, cierre): los
workflows cubren lo que se toca desde la web.

## Reglas propias

- **Ramas de integración.** Las tareas se integran en la rama por defecto de cada repo:
  `unificacion` en tienda3d y tienda-plastik-page (puesta por defecto el 2026-10-27, mientras dure
  la unificación) y `main` en tienda-plastik-infra. Al terminar: PR `unificacion → main` en cada
  repo, y `main` vuelve a ser la rama por defecto.
- **Tarea en varios repos.** El issue vive en el repo de su primera etiqueta. Los PRs de los otros
  repos usan `Refs owner/repo#N`, y el último en mergear usa `Closes owner/repo#N`.
- **Merge.** Los PRs de cada tarea los mergea Claude cuando la verificación local está en verde
  (`pnpm verify` donde exista; si no, la verificación mínima del plan §0). **No hay GitHub
  Actions**: nada de esto corre en GitHub.
- **Piden OK explícito antes de ejecutarse**: F0·5 (mensaje a la dueña), F1·5 (rotar credenciales
  de la base en uso), F9·1 y F9·2 contra la base en uso, y cualquier paso que borre datos.
