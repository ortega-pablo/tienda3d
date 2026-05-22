# ===== API production image (multi-stage) =====
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ----- deps: install workspace dependencies -----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile=false

# ----- build: compile API and shared package -----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY tsconfig.base.json package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @tienda3d/shared build || true
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

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/apps/api
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/main.js"]
