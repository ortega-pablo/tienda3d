-- Defaults precargados al abrir el form de cotización de llaveros.
-- Singleton: una sola fila con id estable `keychain_defaults_singleton`.
-- Los valores siguen la convención de batch (totales para producir
-- keychain_batch_size llaveros).

CREATE TABLE "keychain_defaults" (
  "id"                TEXT          NOT NULL,
  "pieceName"         TEXT          NOT NULL DEFAULT 'Llavero',
  "pieceGrams"        DECIMAL(10,3) NOT NULL DEFAULT 0,
  "piecePrintMinutes" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "pieceFilamentId"   TEXT,
  "assemblyMinutes"   DECIMAL(10,2) NOT NULL DEFAULT 0,
  "managementMinutes" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "keychain_defaults_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "keychain_defaults"
  ADD CONSTRAINT "keychain_defaults_pieceFilamentId_fkey"
  FOREIGN KEY ("pieceFilamentId") REFERENCES "materials"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "keychain_default_materials" (
  "id"          TEXT          NOT NULL,
  "defaultsId"  TEXT          NOT NULL,
  "materialId"  TEXT          NOT NULL,
  "quantity"    DECIMAL(10,3) NOT NULL,
  "sortOrder"   INTEGER       NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "keychain_default_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "keychain_default_materials_defaultsId_materialId_key"
  ON "keychain_default_materials"("defaultsId", "materialId");
CREATE INDEX "keychain_default_materials_defaultsId_idx"
  ON "keychain_default_materials"("defaultsId");

ALTER TABLE "keychain_default_materials"
  ADD CONSTRAINT "keychain_default_materials_defaultsId_fkey"
  FOREIGN KEY ("defaultsId") REFERENCES "keychain_defaults"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "keychain_default_materials"
  ADD CONSTRAINT "keychain_default_materials_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "materials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Singleton row: id estable para upsert idempotente desde el service y
-- el seed. Valores en cero — el admin los carga desde la UI.
INSERT INTO "keychain_defaults"
  ("id", "pieceName", "pieceGrams", "piecePrintMinutes", "assemblyMinutes", "managementMinutes", "updatedAt")
VALUES
  ('keychain_defaults_singleton', 'Llavero', 0, 0, 0, 0, NOW())
ON CONFLICT ("id") DO NOTHING;
