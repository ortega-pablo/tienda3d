-- Permisos del rol con el que corre la API: lee y escribe datos, nunca cambia
-- la estructura. Idempotente: lo corre scripts/migrate.sh, con el dueño del
-- esquema, después de cada `prisma migrate deploy`.
--
--   psql "$URL_DEL_DUENO" -v ON_ERROR_STOP=1 -v app_role=tienda3d_app -f prisma/grants.sql
--
-- El rol lo crea la infraestructura (tienda-plastik-infra, db/init) con su
-- contraseña; acá solo se le dan permisos.
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
-- El historial de migraciones solo lo escribe el dueño.
REVOKE INSERT, UPDATE, DELETE ON TABLE public._prisma_migrations FROM :"app_role";
-- Las tablas y secuencias que creen las migraciones futuras nacen con estos permisos.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_role";
-- La API valida los pedidos de la tienda contra lo mismo que ve el sitio, las
-- vistas storefront_v1 (F14·3): solo lectura.
GRANT USAGE ON SCHEMA storefront_v1 TO :"app_role";
GRANT SELECT ON ALL TABLES IN SCHEMA storefront_v1 TO :"app_role";
