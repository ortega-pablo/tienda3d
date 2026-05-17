-- SKUs auto-generados para productos con patrón PTK-PROD-NNNNNN[-VYY].
--
-- - PTK-     prefijo de marca (Plastik 3D)
-- - PROD-    namespace del catálogo de productos
-- - NNNNNN   secuencial global de 6 dígitos (hasta 999.999)
-- - -VYY     sufijo opcional para variantes futuras (V01, V02, ...)
--
-- El SKU se vuelve obligatorio (NOT NULL) y deja de pedirse en el formulario.
-- Los SKUs existentes (incluso los cargados manualmente como "CDR-A5-8D") se
-- reemplazan por nuevos secuenciales para que todo el catálogo siga el patrón.

-- 1. Secuencia Postgres dedicada para asignar números de forma atómica.
--    El backend hace `SELECT nextval('product_sku_seq')` al crear productos.
CREATE SEQUENCE IF NOT EXISTS product_sku_seq START 1;

-- 2. Re-asignar SKU a todos los productos existentes, ordenados por createdAt
--    para preservar el orden de creación en la numeración.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM products
)
UPDATE products p
SET sku = 'PTK-PROD-' || LPAD(o.rn::text, 6, '0')
FROM ordered o
WHERE p.id = o.id;

-- 3. Avanzar la secuencia para que el próximo nextval() salga después del
--    último producto existente. Si hay 10 productos, próximo será 000011.
SELECT setval(
  'product_sku_seq',
  (SELECT COUNT(*) FROM products),
  true
);

-- 4. Volver el campo NOT NULL (antes era opcional). El UNIQUE ya existe.
ALTER TABLE "products" ALTER COLUMN "sku" SET NOT NULL;
