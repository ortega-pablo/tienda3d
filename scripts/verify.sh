#!/usr/bin/env sh
# Verificación completa del repo, antes de mergear un PR. No hay GitHub Actions:
# esto es lo que la reemplaza.
#
#   pnpm verify
#
# typecheck + lint + tests unitarios + tests de integración. Si no hay
# TEST_DATABASE_URL, levanta un Postgres 16 efímero en Docker (puerto libre al
# azar) y lo borra al terminar.
set -eu
cd "$(dirname "$0")/.."

paso() { printf '\n▶ %s\n' "$1"; }

paso "shared"
pnpm --filter @tienda3d/shared build >/dev/null

paso "typecheck"
pnpm typecheck

paso "lint"
pnpm lint

paso "tests unitarios"
pnpm test

paso "tests de integración"
contenedor=""
if [ -z "${TEST_DATABASE_URL:-}" ]; then
  command -v docker >/dev/null 2>&1 || { echo "Sin TEST_DATABASE_URL y sin Docker: no se pueden correr los tests de integración." >&2; exit 1; }
  contenedor="tienda3d-verify-$$"
  trap 'docker rm -f "$contenedor" >/dev/null 2>&1 || true' EXIT INT TERM
  docker run -d --rm --name "$contenedor" -p 127.0.0.1::5432 \
    -e POSTGRES_USER=verify -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=tienda3d_test \
    postgres:16-alpine >/dev/null
  i=0
  until docker exec "$contenedor" pg_isready -U verify -q 2>/dev/null; do
    i=$((i + 1)); [ "$i" -gt 60 ] && { echo "Postgres no arrancó" >&2; exit 1; }
    sleep 1
  done
  sleep 1
  puerto="$(docker port "$contenedor" 5432/tcp | head -1 | sed 's/.*://')"
  export TEST_DATABASE_URL="postgresql://verify:verify@127.0.0.1:${puerto}/tienda3d_test?schema=public"
fi
pnpm --filter @tienda3d/api exec jest --config jest.integration.config.js --runInBand --forceExit

printf '\n✔ verify en verde\n'
