# tienda3d — sistema de gestión de Tienda Plastik

Cotización, costeo, stock de insumos y producción (Next.js + NestJS + Prisma + Postgres, monorepo
pnpm). Arranque y operación en [README.md](README.md); qué hace el sistema en
[docs/funcionalidades-sistema-gestion.md](docs/funcionalidades-sistema-gestion.md).

- **Rama de trabajo**: `unificacion` es la rama por defecto mientras dure la unificación con la
  tienda online. Cada tarea entra por su PR (`feat/<id>-<slug>`).
- **Commits**: estilo convencional del repo (`feat(scope): …`, `fix(scope): …`, `docs(plan): …`).
- **Verificación local, sin GitHub Actions**: `pnpm typecheck && pnpm test && pnpm test:int`
  (o `pnpm verify` cuando exista, F2·7).
- **Base**: cambios de esquema siempre por migración. No resetear una base con datos sin preguntar.
- **Permisos**: toda ruta nueva lleva `@Permissions(...)`; `route-permissions.spec.ts` lo exige.
  Un permiso nuevo llega a una base existente por migración (INSERT), no solo por el seed.

## Gestión del proyecto

Planes: docs/plans/
Tablero: .claude/tablero.md

## El tablero

[Tienda Plastik · Unificación](https://github.com/users/ortega-pablo/projects/2) es una proyección
del plan [docs/plans/ecosistema-tienda-online.md](docs/plans/ecosistema-tienda-online.md): ningún
documento cita números de issue, y el trabajo nuevo entra por el plan, no como un issue suelto.

Se maneja con `/mec-global:tablero`: plugin `mec-global` ≥ 0.9.1
(`claude plugin marketplace add mecantronic/mec-ai-tooling` y
`claude plugin install mec-global@mec-ai-tooling`) y `gh` con el scope `project`
(`gh auth refresh -s project`).

**Reconcile**: al cerrar cada sesión de trabajo y después de mergear el PR de una tarea.

**Cada paso de una tarea se le dice a Claude**, no se hace a mano desde la web:

- «Arranco con F5·3»: la pasa a En curso, arranca el cronómetro, abre la rama y el PR en borrador
  y te asigna. Una tarea arranca cuando se empieza a definir cómo se hace: si te piden planificar o
  ejecutar una tarea que no está en curso, arrancala primero.
- «Corto, fueron dos horas»: imputa el tramo. «Retomo F5·3»: sigue donde quedó, en el mismo PR; si
  era de otra persona, se reasigna.
- «La paso a revisión»: imputa el tramo, saca el PR de borrador y la pasa a En revisión. Claude la
  mergea con la verificación local en verde.
