#!/usr/bin/env sh
# Corre un comando con los secretos de archivo cargados en el entorno.
#
#   sh scripts/with-secrets.sh pnpm prisma migrate deploy
#
# Para cada variable NOMBRE_FILE definida, exporta NOMBRE con el contenido del
# archivo. Lo usan las herramientas que no saben leer NOMBRE_FILE (la CLI de
# Prisma lee DATABASE_URL). El valor vive solo en el entorno de este proceso y
# sus hijos: no queda en la configuración del contenedor.
set -eu
for var in $(env | sed -n 's/^\([A-Z0-9_]*\)_FILE=.*/\1/p'); do
  file="$(printenv "${var}_FILE")"
  [ -r "$file" ] || { echo "No se puede leer ${var}_FILE ($file)" >&2; exit 1; }
  export "$var=$(cat "$file")"
done
exec "$@"
