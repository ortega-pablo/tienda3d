-- F14·2: los pedidos de la tienda online en el sistema (código W-AAAA-NNNN).
-- CreateEnum
CREATE TYPE "WebOrderPayment" AS ENUM ('PENDING', 'AWAITING_TRANSFER', 'APPROVED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "WebOrderFulfillment" AS ENUM ('RECEIVED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebPaymentMethod" AS ENUM ('MERCADOPAGO', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "WebDeliveryMethod" AS ENUM ('PICKUP', 'SHIPPING');

-- CreateTable
CREATE TABLE "web_orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentMethod" "WebPaymentMethod" NOT NULL,
    "paymentStatus" "WebOrderPayment" NOT NULL,
    "fulfillmentStatus" "WebOrderFulfillment" NOT NULL DEFAULT 'RECEIVED',
    "deliveryMethod" "WebDeliveryMethod" NOT NULL,
    "shippingStreet" TEXT,
    "shippingNumber" TEXT,
    "shippingApartment" TEXT,
    "shippingCity" TEXT,
    "shippingProvince" TEXT,
    "shippingPostalCode" TEXT,
    "shippingLabel" TEXT NOT NULL,
    "shippingCents" INTEGER,
    "subtotalCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "customerNote" TEXT NOT NULL DEFAULT '',
    "trackingCode" TEXT,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "cancelReason" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_order_items" (
    "id" TEXT NOT NULL,
    "webOrderId" TEXT NOT NULL,
    "webVariantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantLabel" TEXT NOT NULL,
    "selections" JSONB NOT NULL DEFAULT '[]',
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "productionOrderId" TEXT,

    CONSTRAINT "web_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_order_events" (
    "id" TEXT NOT NULL,
    "webOrderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_orders_code_key" ON "web_orders"("code");

-- CreateIndex
CREATE UNIQUE INDEX "web_orders_externalId_key" ON "web_orders"("externalId");

-- CreateIndex
CREATE INDEX "web_orders_fulfillmentStatus_createdAt_idx" ON "web_orders"("fulfillmentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "web_orders_paymentStatus_idx" ON "web_orders"("paymentStatus");

-- CreateIndex
CREATE INDEX "web_orders_customerId_idx" ON "web_orders"("customerId");

-- CreateIndex
CREATE INDEX "web_order_items_webOrderId_idx" ON "web_order_items"("webOrderId");

-- CreateIndex
CREATE INDEX "web_order_items_webVariantId_idx" ON "web_order_items"("webVariantId");

-- CreateIndex
CREATE INDEX "web_order_events_webOrderId_createdAt_idx" ON "web_order_events"("webOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "web_orders" ADD CONSTRAINT "web_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_order_items" ADD CONSTRAINT "web_order_items_webOrderId_fkey" FOREIGN KEY ("webOrderId") REFERENCES "web_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_order_items" ADD CONSTRAINT "web_order_items_webVariantId_fkey" FOREIGN KEY ("webVariantId") REFERENCES "web_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_order_items" ADD CONSTRAINT "web_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_order_items" ADD CONSTRAINT "web_order_items_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_order_events" ADD CONSTRAINT "web_order_events_webOrderId_fkey" FOREIGN KEY ("webOrderId") REFERENCES "web_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_order_events" ADD CONSTRAINT "web_order_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

