-- Permisos del lector del sitio (storefront_reader): el contrato storefront_v1 y
-- nada más (plan F10·2, §5.3). Idempotente: lo corre scripts/migrate.sh, con el
-- dueño del esquema, después de cada `prisma migrate deploy`, porque recrear una
-- vista le borra los permisos.
--
--   psql "$URL_DEL_DUENO" -v ON_ERROR_STOP=1 -v reader_role=storefront_reader -f prisma/grants-reader.sql
--
-- El rol y sus ajustes (solo lectura, timeouts, search_path, límite de
-- conexiones) los crea la infraestructura (tienda-plastik-infra, db/init).
GRANT USAGE ON SCHEMA storefront_v1 TO :"reader_role";
GRANT SELECT ON ALL TABLES IN SCHEMA storefront_v1 TO :"reader_role";
-- Las vistas que creen las migraciones futuras nacen legibles para el sitio.
ALTER DEFAULT PRIVILEGES IN SCHEMA storefront_v1 GRANT SELECT ON TABLES TO :"reader_role";
-- Nada del esquema interno, aunque alguien lo haya dado a mano.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM :"reader_role";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM :"reader_role";
REVOKE ALL ON SCHEMA public FROM :"reader_role";
