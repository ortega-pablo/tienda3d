# Plan: Edit Mode + Sistema de Feedback (Toast / Confirm / Loader / Errores)

> Plan vivo para el refactor de formularios y sistema de feedback. Marcar tareas
> completadas con `[x]` a medida que se avanza, así si el proceso se corta se
> retoma desde donde quedó.

## Objetivos

- **Modo edición** en formularios:
  - **Editar** → inputs `disabled` por defecto. Botón "Editar" los habilita; "Cancelar" descarta cambios; "Guardar" persiste.
  - **Crear** → inputs habilitados desde el inicio (sin botón de Editar).
- **Toast** (sonner) para mensajes del sistema (success / error / warning / info) — reemplaza estados de error inline cuando son transitorios.
- **ConfirmDialog** custom — reemplaza `window.confirm()` en todo el front.
- **Loader/Spinner** unificado para acciones async (botones + overlays).
- **Error handling** robusto:
  - Backend: filtro global que normaliza errores de NestJS, Zod, Prisma y errores genéricos.
  - Frontend: `ApiError` extendido con `code` y `details`; util `handleApiError()`; ErrorBoundary global.

---

## Fase 1 — Foundation reutilizable

Componentes y utilidades que el resto consume.

### Backend

- [x] `apps/api/src/common/utils/error-codes.ts` — enum `ErrorCode` con strings: `VALIDATION`, `CONFLICT`, `NOT_FOUND`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL`, `RATE_LIMIT`.
- [x] `apps/api/src/common/filters/http-exception.filter.ts` — `@Catch()` global que mapea:
  - `HttpException` → respeta status, deriva `code` desde el status.
  - `Prisma.PrismaClientKnownRequestError` → `P2002` (CONFLICT, unique), `P2025` (NOT_FOUND), `P2003` (CONFLICT, FK), demás → BAD_REQUEST.
  - `ZodError` → VALIDATION, devuelve `details.fields` array.
  - Otros → INTERNAL, log con stack a consola.
  - Shape unificado: `{ code, message, details?, path, timestamp }`.
- [x] Registrar el filtro globalmente en `apps/api/src/main.ts` (ya estaba).
- [x] Logger inyectado en el filtro para que stack traces queden en pino logs.

### Frontend

- [x] `pnpm --filter @tienda3d/web add sonner` — agregar dependencia.
- [x] Componente `apps/web/src/components/ui/spinner.tsx` — circle spinner SVG con tamaños (`sm`, `md`, `lg`) + `LoadingOverlay`.
- [x] Componente `apps/web/src/components/ui/confirm-dialog.tsx` — modal accesible (Esc cierra, focus en confirm), prop `variant` (`default`, `destructive`).
- [x] Hook + provider `apps/web/src/components/confirm-provider.tsx`:
  - `<ConfirmProvider>` envuelve la app, renderiza el dialog.
  - `useConfirm()` devuelve `(opts) => Promise<boolean>`.
- [x] Modificar `apps/web/src/lib/api-client.ts`:
  - Extender `ApiError` con `code: ApiErrorCode`, `details: unknown`.
  - Parsear el shape `{ code, message, details }` que devuelve el filtro del backend.
- [x] Modificar `apps/web/src/lib/api-server.ts` igual.
- [x] Util `apps/web/src/lib/handle-error.ts`:
  - `handleApiError(err, opts?)` decide si mostrar toast.
  - Mensajes humanos por `code` en español.
- [x] `apps/web/src/components/error-boundary.tsx` — Class component que captura errores de render.
- [x] Agregar `<Toaster richColors closeButton position="top-right" />` en `apps/web/src/app/layout.tsx`.
- [x] Wrapping en layout: `<ConfirmProvider>` rodeando `{children}`.

### Hook reutilizable

- [x] `apps/web/src/hooks/use-edit-mode.ts`:
  - `useEditMode(initialEditing?)` → `{ editing, saving, start, cancel, save }`.
  - `save(handler, opts)` corre el handler async, captura `ApiError`, toast en éxito/error.

### Pilot — un formulario refactorizado para validar el patrón

- [x] `/parametros` (ParametersForm) aplicado: edit toggle + spinner + toast + handleApiError.

---

## Fase 2 — Aplicar a los formularios

Para cada formulario, dos cosas:

1. **Modo edición** — inputs disabled por defecto, botón "Editar" / "Cancelar" / "Guardar".
2. **Reemplazar feedback** — `confirm()` → `useConfirm()`; `setError(msg)` transitorio → `toast.error(msg)`; setError(null) después de éxito → `toast.success("Guardado")`.

### Formularios y diálogos

#### Catálogo

- [x] `/canales` (`channels-manager.tsx` + `ChannelDialog`).
- [x] `/insumos` (`material-dialog.tsx`).
- [x] `/insumos` (`prices-dialog.tsx`).
- [x] `/insumos` (`movements-dialog.tsx`).
- [x] `/productos/[id]` (`product-editor.tsx`) — edit pattern aplicado con fieldset disabled.
- [x] `/productos/[id]` (`product-prices.tsx`).
- [x] `/productos/nuevo` — modo create, sin toggle.
- [x] `/equipos` (machines page).
- [x] `/proveedores`.

#### Operaciones

- [x] `/produccion/nueva` (`new-production-form.tsx`) — create, sin toggle.
- [x] `/produccion/[id]` (`production-actions.tsx`).
- [x] `/cotizaciones/nueva-producto` — create.
- [x] `/cotizaciones/nueva-rapida` — create.
- [x] `/cotizaciones/[id]` (`quote-actions.tsx`).

#### Administración

- [ ] `/usuarios` (no existe aún).
- [ ] `/roles` (no existe aún).

### Confirms a reemplazar (búsqueda global de `confirm(`)

- [x] insumos: borrar variante / borrar insumo / borrar precio.
- [x] canales: desactivar canal / borrar canal.
- [x] productos: borrar tier.
- [x] producción: cambio de estado (DONE / CANCELLED).
- [x] cotizaciones: borrar / cambio de estado.
- [x] equipos: borrar equipo.
- [x] proveedores: borrar proveedor.

### Errores inline a evaluar

Algunos errores tienen contexto que conviene dejar inline (ej. al cargar precio de un producto, error específico del campo). Otros son transitorios y van mejor en toast (ej. "no se pudo guardar"). Criterio:

- **Inline** si el error apunta a un campo o sección específica del form.
- **Toast** si es genérico o post-acción.

---

## Convenciones acordadas

- **sonner** para todo el toasting. `toast.success / .error / .warning / .info`.
- **Hard-refresh required after schema changes**: si el backend responde 401 inesperado en dev, el access cookie viejo puede estar pegado.
- **Editing en formularios edit**:
  - Botón **Editar** en el header del card (variant: `outline`).
  - Cuando `editing=true`: botones cambian a **Cancelar** (variant `ghost`) + **Guardar** (variant `default`, con spinner cuando `saving`).
  - Inputs: `disabled={!editing}`.
- **Editing en formularios create**:
  - Sin botón Editar.
  - Solo **Guardar** (con spinner) y **Cancelar** (vuelve a la lista).

---

## Estado actual

- [x] Fase 1 completa
- [x] Fase 2 completa (pendiente sólo: `/usuarios` y `/roles` cuando se construyan)

Cuando ambas estén tildadas, este archivo se puede archivar.
