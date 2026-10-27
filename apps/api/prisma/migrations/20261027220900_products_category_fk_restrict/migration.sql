-- Alinea la regla de borrado de products.categoryId con el esquema.
--
-- 20260508000000_categories creó la clave con ON DELETE SET NULL cuando la
-- columna admitía nulos. Después la categoría pasó a ser obligatoria (NOT NULL)
-- y la regla quedó vieja: un SET NULL sobre una columna NOT NULL nunca puede
-- aplicarse (borrar una categoría con productos fallaba igual, por not-null).
-- RESTRICT es lo que declara el esquema y lo que ya hacía en la práctica.
ALTER TABLE "products" DROP CONSTRAINT "products_categoryId_fkey";

ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
