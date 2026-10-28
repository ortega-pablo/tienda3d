# ===== API production image (multi-stage) =====
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
# Los hooks de git (lefthook) no tienen sentido en la imagen y no hay git.
ENV LEFTHOOK=0
WORKDIR /app

# ----- deps: install workspace dependencies -----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ----- build: compile API and shared package -----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY tsconfig.base.json package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @tienda3d/shared build
RUN cd apps/api && pnpm prisma:generate
RUN pnpm --filter @tienda3d/api build

# ----- runner: minimal production image -----
FROM node:20-alpine AS runner
# postgresql16-client matchea la versión del servicio db (postgres:16-alpine)
# para que `pg_dump -Fc` no se queje por version mismatch al dumpear desde
# el endpoint /admin/backup.
RUN apk add --no-cache libc6-compat openssl tini postgresql16-client
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NODE_ENV=production

# Usuario sin privilegios. La imagen de web ya lo hacía; ésta corría como root
# y además tiene el cliente de Postgres instalado y spawnea pg_dump.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=nestjs:nodejs /app/packages/shared ./packages/shared
COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nestjs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=nestjs:nodejs /app/apps/api/scripts ./apps/api/scripts
# El seed (tsx prisma/seed.ts) importa la lectura de secretos y las reglas de
# claves desde src/common/config: sin estos fuentes falla dentro de la imagen.
COPY --from=build --chown=nestjs:nodejs /app/apps/api/src/common/config ./apps/api/src/common/config
# scripts/integration-key.ts (emitir y revocar claves de integración, F11·1).
COPY --from=build --chown=nestjs:nodejs /app/apps/api/src/common/integration-auth ./apps/api/src/common/integration-auth
# scripts/store-colors.ts y la importación del catálogo de la web (F9).
COPY --from=build --chown=nestjs:nodejs /app/apps/api/src/modules/catalog-import ./apps/api/src/modules/catalog-import
COPY --from=build --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/
COPY --chown=nestjs:nodejs package.json pnpm-workspace.yaml ./

USER nestjs
WORKDIR /app/apps/api
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
# La API no migra al arrancar: lo hace el servicio `migrate` con el dueño del
# esquema (scripts/migrate.sh) y la API se conecta con un rol sin DDL. Lee sus
# secretos de archivo sola (NOMBRE_FILE).
CMD ["node", "dist/main.js"]
