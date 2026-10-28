#!/usr/bin/env sh
# Migraciones de la base, con el dueño del esquema. Lo corre el servicio
# `migrate` antes de que arranque la API (que se conecta con un rol sin DDL).
#
#   MIGRATION_DATABASE_URL   conexión del dueño del esquema (o _FILE, vía with-secrets.sh).
#                            Si falta, usa DATABASE_URL (instalación de un solo usuario).
#   APP_DB_ROLE              rol de la API: si está, se le aplican los permisos de
#                            prisma/grants.sql. Si no, no se tocan permisos.
#   READER_DB_ROLE           rol con el que el sitio lee el catálogo: si está, se le
#                            aplican los de prisma/grants-reader.sql (solo storefront_v1).
#   RUN_SEED=true            corre también el seed (primer arranque de una base).
#
#   sh scripts/with-secrets.sh sh scripts/migrate.sh
set -eu
cd "$(dirname "$0")/.."

# Binarios instalados: sin pnpm/corepack, que intentan descargar pnpm de
# internet al ejecutar (la red interna del ecosistema no tiene salida).
bin="./node_modules/.bin"

url="${MIGRATION_DATABASE_URL:-${DATABASE_URL:-}}"
[ -n "$url" ] || { echo "Falta MIGRATION_DATABASE_URL (o DATABASE_URL)" >&2; exit 1; }

DATABASE_URL="$url" "$bin/prisma" migrate deploy

if [ -n "${APP_DB_ROLE:-}" ]; then
  # psql no entiende los parámetros de Prisma (?schema=public): se cortan.
  psql "${url%%\?*}" -v ON_ERROR_STOP=1 -q -v app_role="$APP_DB_ROLE" -f prisma/grants.sql
  echo "Permisos aplicados al rol $APP_DB_ROLE."
fi

if [ -n "${READER_DB_ROLE:-}" ]; then
  psql "${url%%\?*}" -v ON_ERROR_STOP=1 -q -v reader_role="$READER_DB_ROLE" -f prisma/grants-reader.sql
  echo "Permisos de lectura del sitio aplicados al rol $READER_DB_ROLE."
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  DATABASE_URL="$url" "$bin/tsx" prisma/seed.ts
fi
