#!/usr/bin/env bash
# Backup de la base local de Plastik3D directo a iCloud Drive.
# Asume:
#   - El container tienda3d_db está corriendo.
#   - Las variables POSTGRES_USER y POSTGRES_DB están en el `.env` del proyecto.
#
# Uso:
#   ./scripts/backup-db.sh              # dump al día actual
#   KEEP=14 ./scripts/backup-db.sh      # rota dejando los últimos 14
#
# El archivo se guarda en formato custom (Fc) — más chico y más rápido
# de restaurar que SQL plano. Restaurar con:
#   docker exec -i tienda3d_db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < archivo.dump

set -euo pipefail

CONTAINER="tienda3d_db"
ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Plastik3D/Backups"
KEEP="${KEEP:-30}"   # cantidad de backups a conservar (override con KEEP=N)

# Verificar que el container esté corriendo antes de intentar el dump.
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "✗ El container '${CONTAINER}' no está corriendo. Levantá el proyecto primero:"
  echo "    docker compose up -d"
  exit 1
fi

# Asegurar que iCloud Drive esté disponible (a veces tarda en montar tras login).
if [ ! -d "$ICLOUD_DIR" ]; then
  mkdir -p "$ICLOUD_DIR" || {
    echo "✗ No se pudo crear $ICLOUD_DIR — verificá que iCloud Drive esté activo en este Mac."
    exit 1
  }
fi

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
OUT="$ICLOUD_DIR/tienda3d_${TIMESTAMP}.dump"

echo "→ Dump de $CONTAINER → $OUT"

# `-t` deshabilita TTY (output limpio en stdout). El comando lee POSTGRES_USER
# y POSTGRES_DB del entorno del container, así no dependemos del .env local.
docker exec -t "$CONTAINER" bash -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$OUT"

# Validar que el dump tenga formato custom válido (empieza con PGDMP).
if ! head -c 5 "$OUT" | grep -q "PGDMP"; then
  echo "✗ El dump no tiene formato válido. Borrando archivo corrupto."
  rm -f "$OUT"
  exit 1
fi

SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo "✓ Backup OK ($SIZE)"

# Rotación: dejamos los $KEEP más recientes.
TOTAL="$(find "$ICLOUD_DIR" -name 'tienda3d_*.dump' -type f | wc -l | tr -d ' ')"
if [ "$TOTAL" -gt "$KEEP" ]; then
  TO_DELETE=$((TOTAL - KEEP))
  echo "→ Rotación: borrando $TO_DELETE backup(s) viejo(s) (manteniendo $KEEP)"
  # ls -t ordena por fecha de modificación, más nuevo primero.
  # tail -n +N salta los primeros (N-1), o sea conserva los más nuevos.
  ls -t "$ICLOUD_DIR"/tienda3d_*.dump | tail -n "+$((KEEP + 1))" | xargs rm -f
fi

echo "→ Sincronizando con iCloud (puede tardar unos segundos)…"
# iCloud sincroniza automáticamente — este comando solo le da una pista.
# No es estrictamente necesario, pero acelera la subida en algunos casos.
touch "$ICLOUD_DIR" 2>/dev/null || true

echo "✓ Listo. Mirá el archivo en Finder → iCloud Drive → Plastik3D/Backups."
