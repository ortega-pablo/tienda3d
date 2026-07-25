# Logo de la marca para PDFs

Colocá el logo de la tienda acá como **`logo.png`** (o `logo.jpg`) para que se
embeba en el header de los documentos exportados (presupuestos, catálogo de
cliente).

- Formato recomendado: **PNG con fondo transparente**, alto ~150-300 px.
- El PDF lo renderiza con **38 px de alto** a la izquierda del nombre "Tienda
  Plastik". El ancho se ajusta manteniendo la proporción.
- Si el archivo no existe, el header cae automáticamente al nombre en texto (sin
  romper la generación del PDF).

También se puede apuntar a otra ruta con la variable de entorno
`BRAND_LOGO_PATH` (path absoluto dentro del contenedor/servidor).

> Este archivo `README.md` es solo documentación; el que se usa es `logo.png`.
