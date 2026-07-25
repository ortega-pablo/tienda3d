-- Notas internas del producto, visibles solo para usuarios administrativos.
-- Aditiva: NULL en productos existentes.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "notes" TEXT;
