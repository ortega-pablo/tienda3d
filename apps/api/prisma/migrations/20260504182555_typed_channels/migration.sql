-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('DIRECT_SALE', 'CASH', 'MARKETPLACE', 'CUSTOM');

-- AlterTable channels
ALTER TABLE "channels"
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "kind" "ChannelKind" NOT NULL DEFAULT 'CUSTOM';

-- Rename product_channel_overrides → product_channels (preserves existing data)
ALTER TABLE "product_channel_overrides" RENAME TO "product_channels";
ALTER TABLE "product_channels" ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "product_channels" ADD COLUMN "notes" TEXT;

-- Rename constraints + indexes to match new table name
ALTER TABLE "product_channels"
  RENAME CONSTRAINT "product_channel_overrides_pkey" TO "product_channels_pkey";
ALTER TABLE "product_channels"
  RENAME CONSTRAINT "product_channel_overrides_productId_fkey" TO "product_channels_productId_fkey";
ALTER TABLE "product_channels"
  RENAME CONSTRAINT "product_channel_overrides_channelId_fkey" TO "product_channels_channelId_fkey";
ALTER INDEX "product_channel_overrides_productId_channelId_key"
  RENAME TO "product_channels_productId_channelId_key";
