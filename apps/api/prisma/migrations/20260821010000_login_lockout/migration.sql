-- Bloqueo de login por cuenta.
--
-- El rate limit de /auth/login era por IP, y la IP se podía falsificar: el
-- proxy de Next reenviaba el `x-forwarded-for` del cliente y la API corre con
-- `trust proxy: 1`. Aunque eso ya se corrigió saneando la cabecera, el límite
-- por IP sigue siendo débil por diseño (todos los usuarios comparten la IP del
-- contenedor `web`, y detrás de NAT comparten la de la oficina).
--
-- El contador por cuenta no depende de la red: N fallidos consecutivos sobre el
-- mismo usuario lo bloquean por un rato, cambie de IP quien lo intente.
ALTER TABLE "users"
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);
