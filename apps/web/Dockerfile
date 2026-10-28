# ===== Web production image (Next.js standalone) =====
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
# Los hooks de git (lefthook) no tienen sentido en la imagen y no hay git.
ENV LEFTHOOK=0
WORKDIR /app

# ----- deps -----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ----- build -----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
# F-30: el lockfile también va en esta etapa. Turbopack lo usa para inferir la
# raíz del workspace; sin él toma apps/web como raíz y no puede seguir los
# enlaces de pnpm, que apuntan a /app/node_modules/.pnpm, fuera de esa raíz.
COPY tsconfig.base.json package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
# shared se consume compilado (la API lo requiere en runtime), así que hay que
# construirlo antes que web.
RUN pnpm --filter @tienda3d/shared build
RUN pnpm --filter @tienda3d/web build

# ----- runner -----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
