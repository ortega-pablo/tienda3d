-- Contrato de lectura del sitio, versión 1 (plan F10·1, §5.4).
--
-- El sitio lee el catálogo con el rol storefront_reader, que solo tiene USAGE en
-- este esquema y SELECT en sus vistas (prisma/grants-reader.sql). Las vistas son
-- del dueño de la base y corren con sus permisos: el lector no ve ninguna tabla.
-- WITH (security_barrier): un filtro del que consulta no se evalúa antes que los
-- de la vista, así no puede filtrar datos ocultos por efectos secundarios.
--
-- Solo se ve lo publicado, con producto del sistema activo, miembro activo,
-- opciones y colores activos (también en Insumos) y precio calculado. Los montos
-- van en centavos enteros. Ninguna vista expone costos, recetas, proveedores,
-- markups, notas, clientes ni usuarios.
--
-- Versionado: un cambio aditivo va en storefront_v1; uno que rompe crea
-- storefront_v2 y conviven hasta que el sitio migre. Una migración que toque una
-- columna usada acá tiene que recrear las vistas (Postgres no la deja borrar).
-- Contrato completo: docs/contrato-storefront-v1.md.

CREATE SCHEMA IF NOT EXISTS storefront_v1;

-- Combinaciones vendibles hoy.
CREATE VIEW storefront_v1.variants WITH (security_barrier) AS
SELECT
  v.id,
  v."webProductId" AS product_id,
  v.sku,
  m.id AS member_value_key,
  m."valueLabel" AS member_value_label,
  m."sortOrder" AS member_sort,
  (wp.price * 100)::int AS price_cents,
  v.availability::text AS availability,
  -- Stock listo para entregar; null si se fabrica a pedido.
  CASE WHEN v.availability = 'MADE_TO_ORDER' THEN NULL ELSE GREATEST(v."stockQuantity", 0) END
    AS available_quantity,
  COALESCE(v."maxPerOrder", 20) AS max_per_order,
  v."leadTimeDays" AS lead_time_days,
  v."imageId" AS image_id,
  (ROW_NUMBER() OVER (PARTITION BY v."webProductId" ORDER BY m."sortOrder", v.sku))::int AS sort
FROM public.web_variants v
JOIN public.web_products p ON p.id = v."webProductId"
JOIN public.web_product_members m ON m.id = v."memberId"
JOIN public.products sp ON sp.id = m."productId"
JOIN public.web_prices wp ON wp."productId" = m."productId"
WHERE p.status = 'PUBLISHED'
  AND v."isActive"
  AND m."isActive"
  AND sp."isActive"
  AND wp.state = 'OK'
  AND wp.price IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.web_variant_selections s
    LEFT JOIN public.materials mat ON mat.id = s."materialId"
    LEFT JOIN public.web_color_options co ON co.id = s."colorOptionId"
    LEFT JOIN public.web_color_values cv
      ON cv."optionId" = s."colorOptionId" AND cv."materialId" = s."materialId"
    LEFT JOIN public.web_attribute_values av ON av.id = s."attributeValueId"
    LEFT JOIN public.web_attributes a ON a.id = av."attributeId"
    WHERE s."variantId" = v.id
      AND (
        (s."materialId" IS NOT NULL
          AND (mat."isActive" IS NOT TRUE OR co."isActive" IS NOT TRUE OR cv."optionId" IS NULL))
        OR (s."attributeValueId" IS NOT NULL
          AND (av."isActive" IS NOT TRUE OR a."isActive" IS NOT TRUE))
      )
  );

-- Publicaciones visibles: publicadas y con al menos una variante a la venta.
CREATE VIEW storefront_v1.products WITH (security_barrier) AS
SELECT
  p.id,
  p.slug,
  p.name,
  p.summary,
  p.description,
  p."seoTitle" AS seo_title,
  p."seoDescription" AS seo_description,
  p."optionLabel" AS option_label,
  p.featured,
  p."sortOrder" AS sort_order,
  p."publishedAt" AS published_at,
  p."updatedAt" AS updated_at
FROM public.web_products p
WHERE p.status = 'PUBLISHED'
  AND EXISTS (SELECT 1 FROM storefront_v1.variants v WHERE v.product_id = p.id);

-- Qué elige el cliente en cada variante: tamaño/modelo (si hay más de uno),
-- colores y opciones informativas.
CREATE VIEW storefront_v1.variant_options WITH (security_barrier) AS
SELECT
  v.id AS variant_id,
  'member'::text AS option_kind,
  'member'::text AS option_key,
  p."optionLabel" AS option_label,
  v.member_value_key AS value_key,
  v.member_value_label AS value_label,
  NULL::text AS color_hex,
  0 AS option_sort,
  v.member_sort AS value_sort
FROM storefront_v1.variants v
JOIN public.web_products p ON p.id = v.product_id
WHERE (
  SELECT count(DISTINCT x.member_value_key) FROM storefront_v1.variants x WHERE x.product_id = v.product_id
) > 1
UNION ALL
SELECT
  v.id,
  'color',
  co.id,
  co.label,
  mat.id,
  COALESCE(mat.color, mat.name),
  mat."colorHex",
  1 + co."sortOrder",
  cv."sortOrder"
FROM storefront_v1.variants v
JOIN public.web_variant_selections s ON s."variantId" = v.id AND s."materialId" IS NOT NULL
JOIN public.web_color_options co ON co.id = s."colorOptionId"
JOIN public.materials mat ON mat.id = s."materialId"
JOIN public.web_color_values cv ON cv."optionId" = co.id AND cv."materialId" = mat.id
UNION ALL
SELECT
  v.id,
  'attribute',
  a.id,
  a.label,
  av.slug,
  av.label,
  NULL,
  1000 + a."sortOrder",
  av."sortOrder"
FROM storefront_v1.variants v
JOIN public.web_variant_selections s ON s."variantId" = v.id AND s."attributeValueId" IS NOT NULL
JOIN public.web_attribute_values av ON av.id = s."attributeValueId"
JOIN public.web_attributes a ON a.id = av."attributeId";

-- Fotos de las publicaciones visibles. path es relativo al volumen media.
CREATE VIEW storefront_v1.images WITH (security_barrier) AS
SELECT
  i.id,
  i."webProductId" AS product_id,
  i.path,
  i.alt,
  i.width,
  i.height,
  i.position,
  i."colorMaterialId" AS color_value_key
FROM public.web_images i
WHERE i."webProductId" IN (SELECT id FROM storefront_v1.products);

-- Categorías activas (una hija se ve solo si su madre también está activa).
CREATE VIEW storefront_v1.categories WITH (security_barrier) AS
SELECT
  c.id,
  c.slug,
  c.name,
  c.description,
  c."parentId" AS parent_id,
  c."imagePath" AS image_path,
  c."sortOrder" AS sort_order
FROM public.web_categories c
LEFT JOIN public.web_categories parent ON parent.id = c."parentId"
WHERE c."isActive" AND (c."parentId" IS NULL OR parent."isActive");

CREATE VIEW storefront_v1.product_categories WITH (security_barrier) AS
SELECT pc."webProductId" AS product_id, pc."webCategoryId" AS category_id
FROM public.web_product_categories pc
WHERE pc."webProductId" IN (SELECT id FROM storefront_v1.products)
  AND pc."webCategoryId" IN (SELECT id FROM storefront_v1.categories);

-- Slugs viejos que redirigen al actual.
CREATE VIEW storefront_v1.slug_redirects WITH (security_barrier) AS
SELECT s.slug AS old_slug, p.slug AS product_slug
FROM public.web_product_slugs s
JOIN storefront_v1.products p ON p.id = s."webProductId";

-- Condiciones de venta: siempre una fila, con los valores por defecto si el
-- admin todavía no guardó nada.
CREATE VIEW storefront_v1.store_settings WITH (security_barrier) AS
SELECT
  (s."shippingFlatRate" * 100)::int AS shipping_flat_rate_cents,
  (s."freeShippingFrom" * 100)::int AS free_shipping_from_cents,
  COALESCE(s."pickupEnabled", true) AS pickup_enabled,
  COALESCE(s."pickupInstructions", '') AS pickup_instructions,
  COALESCE(s."bankTransferEnabled", false) AS bank_transfer_enabled,
  COALESCE(s."bankTransferInstructions", '') AS bank_transfer_instructions,
  COALESCE(s."notificationEmail", '') AS notification_email
FROM (SELECT 1 AS id) one
LEFT JOIN public.ecommerce_settings s ON s.id = one.id;
