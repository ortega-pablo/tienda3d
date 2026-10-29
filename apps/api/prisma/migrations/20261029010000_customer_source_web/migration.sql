-- F13·8: los clientes de la tienda online (origen web y el id de su cuenta del sitio).
-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('SYSTEM', 'WEB');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "source" "CustomerSource" NOT NULL DEFAULT 'SYSTEM';

-- CreateIndex
CREATE UNIQUE INDEX "customers_externalId_key" ON "customers"("externalId");

-- CreateIndex
CREATE INDEX "customers_source_idx" ON "customers"("source");

