# Plastik 3D — Cotizador, costeo y stock

Sistema dockerizado de cotización, costeo y control de stock para manufactura aditiva (impresión 3D).
Ver [PLAN.md](PLAN.md) para el modelo de negocio y la arquitectura completa.

## Stack

- **Frontend** Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui
- **Backend** NestJS 11 + Prisma 6 + Zod
- **DB** PostgreSQL 16
- **Auth** JWT en cookies httpOnly + RBAC dinámico
- **PDF** pdfkit (server-side)
- **Empaquetado** Docker Compose · pnpm workspaces

## Quick start (local en taller)

```bash
# 1. Variables de entorno
cp .env.example .env
# editar .env: cambiar POSTGRES_PASSWORD, API_JWT_SECRET, API_REFRESH_SECRET

# 2. Levantar todo (db + api + web)
docker compose up --build

# 3. Inicializar DB y seed (solo la primera vez)
docker compose exec api sh -c "cd apps/api && pnpm prisma migrate deploy && pnpm prisma:seed"
```

Endpoints:

- Web: <http://localhost:3000>
- API: <http://localhost:3001/api/health>
- DB: `localhost:5432` (usuario y db según `.env`)

Login inicial: `admin@plastik.local / admin123` (configurable en `.env`).

### Comandos útiles

```bash
# Logs en vivo
docker compose logs -f api
docker compose logs -f web

# Resetear todo (incluye volumen de DB)
docker compose down -v

# Tests del backend (incluye validación contra Excel)
docker compose exec api sh -c "cd apps/api && pnpm test"

# Generar nueva migración tras editar prisma/schema.prisma
docker compose exec api sh -c "cd apps/api && pnpm prisma migrate dev --name <nombre>"

# Backup manual de la base
docker compose exec db pg_dump -U tienda3d tienda3d > backup-$(date +%F).sql
```

## Estructura del repo

```
tienda3d/
├── PLAN.md                          # plan de acción y modelo de datos
├── docker-compose.yml               # prod-like (db + api + web)
├── docker-compose.override.yml      # dev: hot reload, volúmenes
├── apps/
│   ├── api/                         # NestJS + Prisma
│   │   ├── prisma/                  # schema, migraciones, seed
│   │   └── src/modules/             # auth, products, costing, pricing, …
│   └── web/                         # Next.js App Router
│       └── src/app/(protected)/     # rutas con auth + sidebar
└── packages/shared/                 # tipos y schemas Zod compartidos
```

## Tema visual

El tema vive en un único archivo: [`apps/web/src/theme/tokens.css`](apps/web/src/theme/tokens.css). Editá las variables HSL ahí y todo el sitio se re-skinea — modo claro y oscuro.

## RBAC

3 roles base sembrados (`admin`, `operator`, `viewer`) más permisos atómicos (`material:read`, `quote:create`, `parameter:write`, etc.). Desde **Admin > Roles** se pueden crear roles nuevos o cambiar permisos sin redeploy.

## Integraciones externas

Los conectores están **stubeados** y se activan con flags en `.env`:

| Integración | Variable | Estado |
|---|---|---|
| MercadoLibre | `INTEGRATION_MELI_ENABLED` | preparado |
| ARCA / AFIP | `INTEGRATION_ARCA_ENABLED` | preparado |
| WhatsApp Business | `INTEGRATION_WHATSAPP_ENABLED` | preparado |

Ver el estado actual desde **Admin > Integraciones**.

## Validación contra el Excel

`apps/api/src/modules/costing/costing.calculator.spec.ts` y `pricing.engine.spec.ts` validan que el motor de costos y precios produce **los mismos números** que `cotizador_cuaderno_plastik_v2.xlsx` para el cuaderno A5. Si alguien modifica la fórmula sin querer, los tests rompen.

```bash
docker compose exec api sh -c "cd apps/api && pnpm test"
```

## Backups

`docker compose` monta un volumen `db_data` para Postgres. Para producción local se recomienda agregar a cron del taller:

```cron
0 3 * * * cd /ruta/a/tienda3d && docker compose exec -T db pg_dump -U tienda3d tienda3d | gzip > /backups/plastik-$(date +\%F).sql.gz
```

## Migración a AWS (a futuro)

Esta arquitectura está pensada para mover sin sufrimiento.

| Componente local | AWS sugerido | Notas |
|---|---|---|
| `db` (Postgres en contenedor) | **RDS for PostgreSQL 16** | Multi-AZ + backups automáticos. Ajustar `DATABASE_URL`. |
| `api` (Node 20 standalone) | **ECS Fargate** o EC2 + systemd | Imagen a ECR. Lee de Secrets Manager para JWT/DB. |
| `web` (Next.js standalone) | **ECS Fargate** detrás de **CloudFront** | `output: 'standalone'` ya configurado. |
| Imágenes / PDFs | **S3** | Subir desde el backend (cuando se agregue uploads). |
| Logs | **CloudWatch** vía pino | Pino emite JSON estructurado en producción. |
| Secretos | **AWS Secrets Manager** | Inyectar como envs en la task definition. |
| CI/CD | **GitHub Actions** + OIDC → ECR | Build de imágenes y `prisma migrate deploy` en deploy. |

Pasos de alto nivel:

1. Subir las imágenes a ECR (`docker build` con los Dockerfiles de prod).
2. Crear RDS y restaurar dump del taller.
3. Crear servicio ECS para `api` (puerto 3001) y otro para `web` (puerto 3000).
4. ALB delante con dos targets, certificado ACM y CloudFront delante de `web`.
5. Variables de entorno desde Secrets Manager.
6. `prisma migrate deploy` corre como pre-deploy task.

## Roadmap pendiente

Completado: Fases 0 a 9 (auth, catálogo, productos, costeo, precios, cotizaciones+PDF, stock+producción, reportes+auditoría, hardening, stubs de integraciones).

Pendiente:

- **Fase 10 — Portal cliente**: login externo con categoría asignada (minorista / mayorista escala) que ve solo el precio de su categoría.
- Implementación real de los conectores MELI / ARCA / WhatsApp.
- E2E con Playwright para los flujos críticos.
- Bus de eventos y notificaciones internas (cuando crezca el equipo).

## Licencia

Privado — uso interno de Plastik 3D.
