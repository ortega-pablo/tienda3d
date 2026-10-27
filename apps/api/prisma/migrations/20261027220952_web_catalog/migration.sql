-- Tienda online (plan de unificación, F5·1): publicaciones, miembros, opciones de
-- color e informativas, variantes, fotos, categorías de la tienda, slugs viejos,
-- precio publicado con su historial y ajustes de la tienda.

-- CreateEnum
CREATE TYPE "WebProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "WebAvailability" AS ENUM ('MADE_TO_ORDER', 'STOCK_ONLY', 'STOCK_THEN_ORDER');

-- CreateEnum
CREATE TYPE "WebPriceState" AS ENUM ('OK', 'NO_PRICE');

-- CreateTable
CREATE TABLE "web_products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "optionLabel" TEXT NOT NULL DEFAULT 'Modelo',
    "status" "WebProductStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_product_members" (
    "id" TEXT NOT NULL,
    "webProductId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "valueLabel" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "web_product_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_color_options" (
    "id" TEXT NOT NULL,
    "webProductId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Color',
    "filamentLineId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "web_color_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_color_values" (
    "optionId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "web_color_values_pkey" PRIMARY KEY ("optionId","materialId")
);

-- CreateTable
CREATE TABLE "web_color_option_pieces" (
    "optionId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,

    CONSTRAINT "web_color_option_pieces_pkey" PRIMARY KEY ("optionId","pieceId")
);

-- CreateTable
CREATE TABLE "web_attributes" (
    "id" TEXT NOT NULL,
    "webProductId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "web_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_attribute_values" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "web_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_variants" (
    "id" TEXT NOT NULL,
    "webProductId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "selectionKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availability" "WebAvailability" NOT NULL DEFAULT 'MADE_TO_ORDER',
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "maxPerOrder" INTEGER,
    "leadTimeDays" INTEGER,
    "imageId" TEXT,
    "legacySku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_variant_selections" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "colorOptionId" TEXT,
    "materialId" TEXT,
    "attributeValueId" TEXT,

    CONSTRAINT "web_variant_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_images" (
    "id" TEXT NOT NULL,
    "webProductId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "colorMaterialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "imagePath" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_product_categories" (
    "webProductId" TEXT NOT NULL,
    "webCategoryId" TEXT NOT NULL,

    CONSTRAINT "web_product_categories_pkey" PRIMARY KEY ("webProductId","webCategoryId")
);

-- CreateTable
CREATE TABLE "web_product_slugs" (
    "slug" TEXT NOT NULL,
    "webProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_product_slugs_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "web_prices" (
    "productId" TEXT NOT NULL,
    "price" DECIMAL(14,2),
    "state" "WebPriceState" NOT NULL,
    "reason" TEXT,
    "inputsHash" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_prices_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "web_price_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "previous" DECIMAL(14,2),
    "price" DECIMAL(14,2),
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cause" TEXT NOT NULL,

    CONSTRAINT "web_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecommerce_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shippingFlatRate" DECIMAL(14,2),
    "freeShippingFrom" DECIMAL(14,2),
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupInstructions" TEXT NOT NULL DEFAULT '',
    "bankTransferEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bankTransferInstructions" TEXT NOT NULL DEFAULT '',
    "notificationEmail" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecommerce_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_products_slug_key" ON "web_products"("slug");

-- CreateIndex
CREATE INDEX "web_products_status_sortOrder_idx" ON "web_products"("status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "web_product_members_productId_key" ON "web_product_members"("productId");

-- CreateIndex
CREATE INDEX "web_product_members_webProductId_idx" ON "web_product_members"("webProductId");

-- CreateIndex
CREATE INDEX "web_color_options_webProductId_idx" ON "web_color_options"("webProductId");

-- CreateIndex
CREATE INDEX "web_attributes_webProductId_idx" ON "web_attributes"("webProductId");

-- CreateIndex
CREATE UNIQUE INDEX "web_attribute_values_attributeId_slug_key" ON "web_attribute_values"("attributeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "web_variants_sku_key" ON "web_variants"("sku");

-- CreateIndex
CREATE INDEX "web_variants_memberId_idx" ON "web_variants"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "web_variants_webProductId_selectionKey_key" ON "web_variants"("webProductId", "selectionKey");

-- CreateIndex
CREATE INDEX "web_variant_selections_variantId_idx" ON "web_variant_selections"("variantId");

-- CreateIndex
CREATE INDEX "web_images_webProductId_position_idx" ON "web_images"("webProductId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "web_categories_slug_key" ON "web_categories"("slug");

-- CreateIndex
CREATE INDEX "web_categories_parentId_idx" ON "web_categories"("parentId");

-- CreateIndex
CREATE INDEX "web_product_categories_webCategoryId_idx" ON "web_product_categories"("webCategoryId");

-- CreateIndex
CREATE INDEX "web_product_slugs_webProductId_idx" ON "web_product_slugs"("webProductId");

-- CreateIndex
CREATE INDEX "web_price_history_productId_changedAt_idx" ON "web_price_history"("productId", "changedAt");

-- AddForeignKey
ALTER TABLE "web_product_members" ADD CONSTRAINT "web_product_members_webProductId_fkey" FOREIGN KEY ("webProductId") REFERENCES "web_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_product_members" ADD CONSTRAINT "web_product_members_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_color_options" ADD CONSTRAINT "web_color_options_webProductId_fkey" FOREIGN KEY ("webProductId") REFERENCES "web_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_color_options" ADD CONSTRAINT "web_color_options_filamentLineId_fkey" FOREIGN KEY ("filamentLineId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_color_values" ADD CONSTRAINT "web_color_values_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "web_color_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_color_values" ADD CONSTRAINT "web_color_values_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_color_option_pieces" ADD CONSTRAINT "web_color_option_pieces_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "web_color_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_color_option_pieces" ADD CONSTRAINT "web_color_option_pieces_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "product_pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_attributes" ADD CONSTRAINT "web_attributes_webProductId_fkey" FOREIGN KEY ("webProductId") REFERENCES "web_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_attribute_values" ADD CONSTRAINT "web_attribute_values_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "web_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_variants" ADD CONSTRAINT "web_variants_webProductId_fkey" FOREIGN KEY ("webProductId") REFERENCES "web_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_variants" ADD CONSTRAINT "web_variants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "web_product_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_variants" ADD CONSTRAINT "web_variants_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "web_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_variant_selections" ADD CONSTRAINT "web_variant_selections_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "web_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_variant_selections" ADD CONSTRAINT "web_variant_selections_colorOptionId_fkey" FOREIGN KEY ("colorOptionId") REFERENCES "web_color_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_variant_selections" ADD CONSTRAINT "web_variant_selections_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_variant_selections" ADD CONSTRAINT "web_variant_selections_attributeValueId_fkey" FOREIGN KEY ("attributeValueId") REFERENCES "web_attribute_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_images" ADD CONSTRAINT "web_images_webProductId_fkey" FOREIGN KEY ("webProductId") REFERENCES "web_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_images" ADD CONSTRAINT "web_images_colorMaterialId_fkey" FOREIGN KEY ("colorMaterialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_categories" ADD CONSTRAINT "web_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "web_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_product_categories" ADD CONSTRAINT "web_product_categories_webProductId_fkey" FOREIGN KEY ("webProductId") REFERENCES "web_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_product_categories" ADD CONSTRAINT "web_product_categories_webCategoryId_fkey" FOREIGN KEY ("webCategoryId") REFERENCES "web_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_product_slugs" ADD CONSTRAINT "web_product_slugs_webProductId_fkey" FOREIGN KEY ("webProductId") REFERENCES "web_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_prices" ADD CONSTRAINT "web_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_price_history" ADD CONSTRAINT "web_price_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
